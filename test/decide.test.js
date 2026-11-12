import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decideTonight} from '../src/decide.js';
import {distance} from '../src/recommendations.js';
import {venueGroup} from '../src/venues.js';
import {placeKind} from '../src/exploration.js';

const PLACES = JSON.parse(fs.readFileSync(new URL('../src/data/pittsburgh.json', import.meta.url))).places;
const CORRECTIONS = JSON.parse(fs.readFileSync(new URL('../src/data/venue-corrections.json', import.meta.url)));
const byName = name => { const p = PLACES.find(x => x.name === name); assert.ok(p, `missing ${name}`); return p; };
const HEINZ = byName('Heinz Hall'), BENEDUM = byName('Benedum Center'), WARREN = byName('The Warren');
const BUTCHER = byName('Butcher and the Rye'), BIERGARTEN = byName('Biergarten'), COURTHOUSE = byName('Courthouse Tavern');
const CREATIVE = byName('Creative Coffee & Supply'), APOLLO = byName('The Apollo Cafe'), HARRIS = byName('Harris Theater');
const PIZZA_FAR = byName('Slice on Broadway');
const DOWNTOWN = {lat: 40.4406, lng: -79.9959};
// Friday 13 November 2026, 6:30 pm in Pittsburgh.
const FRIDAY = '2026-11-13T18:30:00-05:00';
const MONDAY = '2026-11-16T18:30:00-05:00';
const ctx = (extra = {}) => ({now: FRIDAY, location: DOWNTOWN, companions: null, energy: null, maxKm: null, ...extra});
const daysBefore = (iso, days) => new Date(Date.parse(iso) - days * 86400000).toISOString();
let n = 0;
const save = (place, source = {}) => ({
  id: `save-${++n}`, status: 'saved', place, planDate: '', visitDate: '', notes: '', with: '', rating: 0, photos: [],
  createdAt: '2026-10-01T12:00:00.000Z', updatedAt: '2026-10-01T12:00:00.000Z',
  source: {url: '', app: 'instagram', text: '', savedAt: '', eventDate: '', expiresAt: '', ...source},
});
const visit = (place, visitDate, rating) => ({id: `visit-${++n}`, status: 'visited', place, visitDate, planDate: '', rating, notes: '', with: '', photos: [], createdAt: visitDate + 'T20:00:00.000Z', updatedAt: visitDate + 'T20:00:00.000Z'});
const plan = place => ({id: `plan-${++n}`, status: 'planned', place, visitDate: '', planDate: '', rating: 0, notes: '', with: '', photos: [], createdAt: '2026-11-01T12:00:00.000Z', updatedAt: '2026-11-01T12:00:00.000Z'});
const event = (place, start, extra = {}) => ({id: `ev-${++n}`, title: 'Evening show', venueName: place.name, lat: place.lat, lng: place.lng, start, end: '', url: '', source: 'ical', sourceName: 'Venue calendar', placeId: place.id, fetchedAt: '2026-11-13T12:00:00-05:00', ...extra});
const groupOf = place => venueGroup(place.category) || placeKind(place.category);
const ids = result => result.picks.map(p => p.id);

test('returns up to three picks with a stable shape and a pool count', () => {
  const r = decideTonight({places: PLACES, context: ctx(), seed: 1});
  assert.equal(r.picks.length, 3);
  assert.ok(r.pool > 500 && r.pool <= PLACES.length);
  for (const pick of r.picks) {
    assert.equal(pick.kind, 'place');
    assert.equal(typeof pick.score, 'number');
    assert.ok(Array.isArray(pick.reasons) && pick.reasons.length <= 3);
    assert.equal(pick.id, `place:${pick.place.id}`);
  }
  assert.equal(typeof r.explain.summary, 'string');
});

test('the same seed always gives the same answer', () => {
  const fixed = {saves: [save(WARREN, {savedAt: '2026-10-20T12:00:00Z'})], places: PLACES, events: [event(HEINZ, '2026-11-13T20:00:00-05:00')], outings: [visit(CREATIVE, '2026-10-01', 5)], context: ctx(), seed: 'friday'};
  const input = () => structuredClone(fixed);
  assert.deepEqual(decideTonight(input()), decideTonight(input()));
  assert.deepEqual(decideTonight({...input(), places: [...PLACES].reverse()}).picks, decideTonight(input()).picks, 'input order does not matter');
});

test('different seeds can reorder near-ties', () => {
  const sets = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(seed => ids(decideTonight({places: PLACES, context: ctx({location: null}), seed})).join()));
  assert.ok(sets.size > 1);
});

test('inputs are never mutated', () => {
  const input = {saves: [save(WARREN, {savedAt: '2026-10-20T12:00:00Z'}), save(null, {expiresAt: '2026-11-01'})], places: PLACES.slice(0, 50), events: [event(HEINZ, '2026-11-13T20:00:00-05:00')], outings: [visit(BUTCHER, '2026-11-10', 2)], context: ctx(), exclude: ['x'], seed: 3};
  const before = structuredClone(input);
  decideTonight(input);
  assert.deepEqual(input, before);
});

test('the user\'s own saves come before places and events', () => {
  const saves = [save(WARREN), save(CREATIVE), save(HARRIS)];
  const r = decideTonight({saves, places: PLACES, events: [event(HEINZ, '2026-11-13T20:00:00-05:00')], context: ctx(), seed: 1});
  assert.deepEqual(r.picks.map(p => p.kind), ['save', 'save', 'save']);
  assert.equal(r.picks[0].place.id, r.picks[0].save.place.id);
});

test('an unresolved save can be picked and says the place still needs confirming', () => {
  const pending = save(null, {app: 'tiktok', text: 'that ramen place', savedAt: '2026-11-06T12:00:00Z'});
  const r = decideTonight({saves: [pending], places: PLACES, context: ctx(), seed: 1});
  const pick = r.picks.find(p => p.kind === 'save');
  assert.equal(pick.save.id, pending.id);
  assert.equal(pick.place, undefined);
  assert.ok(pick.reasons.includes('Saved from TikTok · place still needs confirming'));
  assert.ok(!pick.reasons.some(x => /away/.test(x)));
});

test('save age is described in plain English', () => {
  const cases = [[0, 'Saved today'], [1, 'Saved yesterday'], [5, 'Saved 5 days ago'], [21, 'Saved 3 weeks ago'], [95, 'Saved 3 months ago']];
  for (const [days, text] of cases) {
    const r = decideTonight({saves: [save(WARREN, {savedAt: daysBefore(FRIDAY, days)})], context: ctx(), seed: 1});
    assert.ok(r.picks[0].reasons.includes(text), `${days}: ${r.picks[0].reasons}`);
  }
});

test('a future or missing savedAt produces no age reason', () => {
  for (const savedAt of ['', '2026-12-01T00:00:00Z', 'not a date']) {
    const r = decideTonight({saves: [save(WARREN, {savedAt})], context: ctx(), seed: 1});
    assert.ok(!r.picks[0].reasons.some(x => x.startsWith('Saved')));
  }
});

test('a save happening today outranks an older save without a date', () => {
  const old = save(WARREN, {savedAt: daysBefore(FRIDAY, 40)});
  const today = save(BENEDUM, {eventDate: '2026-11-13'});
  const r = decideTonight({saves: [old, today], context: ctx(), seed: 1});
  assert.equal(r.picks[0].save.id, today.id);
  assert.equal(r.picks[0].reasons[0], 'Happening today');
});

test('a save expiring today says it is the last day', () => {
  const r = decideTonight({saves: [save(CREATIVE, {expiresAt: '2026-11-13'})], context: ctx(), seed: 1});
  assert.equal(r.picks[0].reasons[0], 'Last day today');
});

test('a pop-up closing before next weekend is flagged as the last weekend', () => {
  const r = decideTonight({saves: [save(APOLLO, {expiresAt: '2026-11-18'}), save(WARREN)], context: ctx(), seed: 1});
  assert.equal(r.picks[0].save.place.id, APOLLO.id);
  assert.equal(r.picks[0].reasons[0], 'Last weekend before it closes');
});

test('a save dated this Sunday names the day instead of reading as tonight', () => {
  const r = decideTonight({saves: [save(HEINZ, {eventDate: '2026-11-15'})], context: ctx(), seed: 1});
  assert.equal(r.picks[0].reasons[0], 'On Sunday, Nov 15');
});

test('mid-week, a pop-up closing Wednesday is "ends in 2 days", not the last weekend', () => {
  const r = decideTonight({saves: [save(APOLLO, {expiresAt: '2026-11-18'})], context: ctx({now: MONDAY}), seed: 1});
  assert.equal(r.picks[0].reasons[0], 'Ends in 2 days');
});

test('saves whose date has passed are left out, counted, and kept intact', () => {
  const gone = save(HEINZ, {eventDate: '2026-11-01'}), closed = save(null, {expiresAt: '2026-11-12'});
  const before = structuredClone([gone, closed]);
  const r = decideTonight({saves: [gone, closed], context: ctx(), seed: 1});
  assert.equal(r.picks.length, 0);
  assert.equal(r.pool, 0);
  assert.ok(r.explain.notes.some(x => /2 saves have passed their date/.test(x)));
  assert.deepEqual([gone, closed], before);
});

test('events tonight are eligible and say when they start', () => {
  const show = event(HEINZ, '2026-11-13T20:00:00-05:00');
  const r = decideTonight({events: [show], context: ctx(), seed: 1});
  assert.equal(r.picks[0].kind, 'event');
  assert.equal(r.picks[0].event.id, show.id);
  assert.equal(r.picks[0].reasons[0], 'Starts 8:00 pm tonight');
  assert.ok(r.picks[0].reasons.includes('At Heinz Hall'));
});

test('an event after midnight but before 5 am still counts as tonight', () => {
  const late = event(BENEDUM, '2026-11-14T00:30:00-05:00');
  const r = decideTonight({events: [late], context: ctx(), seed: 1});
  assert.equal(r.picks[0].reasons[0], 'Starts 12:30 am tonight');
});

test('events tomorrow or already started with no end time are not offered', () => {
  const tomorrow = event(HEINZ, '2026-11-14T19:00:00-05:00'), started = event(BENEDUM, '2026-11-13T18:00:00-05:00');
  const r = decideTonight({events: [tomorrow, started], context: ctx(), seed: 1});
  assert.equal(r.pool, 0);
});

test('an event under way with an end time says until when', () => {
  const r = decideTonight({events: [event(HEINZ, '2026-11-13T18:00:00-05:00', {end: '2026-11-13T21:15:00-05:00'})], context: ctx(), seed: 1});
  assert.equal(r.picks[0].reasons[0], 'On now until 9:15 pm');
});

test('an event at a place the user saved says so', () => {
  const r = decideTonight({saves: [save(HEINZ)], events: [event(HEINZ, '2026-11-13T20:00:00-05:00')], context: ctx(), seed: 1});
  assert.ok(r.picks.find(p => p.kind === 'event').reasons.includes('At a place you saved'));
});

test('places rated 2 or lower are excluded everywhere', () => {
  const outings = [visit(WARREN, '2026-09-01', 2)];
  const r = decideTonight({saves: [save(WARREN)], places: [WARREN, BUTCHER], events: [event(WARREN, '2026-11-13T21:00:00-05:00')], outings, context: ctx(), seed: 1});
  assert.deepEqual(r.picks.map(p => p.place?.id), [BUTCHER.id]);
});

test('the latest rating wins: a 5 after a 2 brings a place back', () => {
  const outings = [visit(WARREN, '2026-05-01', 2), visit(WARREN, '2026-09-01', 5)];
  const r = decideTonight({places: [WARREN], outings, context: ctx(), seed: 1});
  assert.equal(r.picks[0].place.id, WARREN.id);
  assert.ok(r.picks[0].reasons.includes('You loved it last time'));
});

test('places visited in the last 14 days are deprioritised', () => {
  const outings = [visit(WARREN, '2026-11-10', 5), visit(BUTCHER, '2026-09-10', 5)];
  const r = decideTonight({places: [WARREN, BUTCHER], outings, context: ctx({location: null}), seed: 1});
  assert.equal(r.picks[0].place.id, BUTCHER.id);
  assert.ok(r.picks[1].reasons.includes('You went 3 days ago'));
});

test('unvisited places like ones the user rated highly get a lift and an honest reason', () => {
  const outings = [visit(WARREN, '2026-09-01', 5)];
  const r = decideTonight({places: PLACES, outings, context: ctx({location: null}), seed: 1});
  const bar = r.picks.find(p => groupOf(p.place) === 'drinks');
  assert.ok(bar, 'a bar is picked');
  assert.notEqual(bar.place.id, WARREN.id);
  assert.ok(bar.reasons.includes('Like The Warren, which you loved'));
});

test('a planned outing is surfaced as already in your plans', () => {
  const r = decideTonight({places: PLACES, outings: [plan(PIZZA_FAR)], context: ctx({location: null}), seed: 1});
  assert.equal(r.picks[0].place.id, PIZZA_FAR.id);
  assert.equal(r.picks[0].reasons[0], 'Already in your plans');
});

test('zero saves still gives good picks from places and events', () => {
  const r = decideTonight({saves: [], places: PLACES, events: [event(HEINZ, '2026-11-13T20:00:00-05:00')], context: ctx(), seed: 1});
  assert.equal(r.picks.length, 3);
  assert.ok(r.picks.some(p => p.kind === 'event'));
  assert.ok(r.picks.some(p => p.kind === 'place'));
});

test('no location means no distance reasons, and explain says why', () => {
  const r = decideTonight({saves: [save(WARREN)], places: PLACES, events: [event(HEINZ, '2026-11-13T20:00:00-05:00')], context: ctx({location: null, maxKm: 1}), seed: 1});
  assert.ok(r.picks.every(p => p.reasons.every(x => !/ (k)?m away/.test(x))));
  assert.ok(r.explain.notes.includes('Your location is unknown, so distance is not used.'));
  assert.ok(r.explain.notes.includes('The distance limit needs your location, so it was not applied.'));
});

test('with a location, distance is real straight-line distance from it', () => {
  const r = decideTonight({places: [HEINZ], context: ctx(), seed: 1});
  const km = distance(DOWNTOWN, HEINZ);
  assert.equal(r.picks[0].reasons[0], `${Math.round(km * 20) * 50} m away`);
});

test('maxKm drops farther places and events and explains it', () => {
  const r = decideTonight({places: [HEINZ, PIZZA_FAR], events: [event(PIZZA_FAR, '2026-11-13T20:00:00-05:00')], context: ctx({maxKm: 2}), seed: 1});
  assert.deepEqual(r.picks.map(p => p.place.id), [HEINZ.id]);
  assert.ok(r.explain.notes.some(x => /2 options are beyond your distance limit/.test(x)));
});

test('unresolved saves survive a distance limit because their distance is unknown', () => {
  const r = decideTonight({saves: [save(null)], context: ctx({maxKm: 0.5}), seed: 1});
  assert.equal(r.picks.length, 1);
});

test('"open now" is never claimed, even for a place with hours text', () => {
  const withHours = PLACES.find(p => p.hours);
  const r = decideTonight({saves: [save(withHours)], places: PLACES, context: ctx(), seed: 1});
  for (const pick of r.picks) assert.ok(pick.reasons.every(x => !/open/i.test(x)));
  assert.ok(r.explain.notes.includes('Opening hours are not checked; confirm before you go.'));
});

test('variety: with no history the three picks are not all the same kind of place', () => {
  for (const seed of [1, 2, 3, 4]) {
    const r = decideTonight({places: PLACES, context: ctx(), seed});
    assert.ok(new Set(r.picks.map(p => groupOf(p.place))).size > 1, `seed ${seed}`);
  }
});

test('variety: three bar saves and a café save of similar weight yields a mix', () => {
  const saves = [save(WARREN), save(BUTCHER), save(BIERGARTEN), save(CREATIVE)];
  const r = decideTonight({saves, context: ctx({location: null}), seed: 1});
  assert.ok(r.picks.some(p => p.place.id === CREATIVE.id));
});

test('low energy keeps it close and to food, coffee and drinks', () => {
  const low = decideTonight({places: PLACES, context: ctx({energy: 'low'}), seed: 2});
  assert.ok(low.picks.every(p => ['food', 'coffee', 'drinks'].includes(groupOf(p.place))));
  assert.ok(low.picks.every(p => distance(DOWNTOWN, p.place) < 1));
  assert.ok(low.explain.notes.some(x => x.startsWith('Low energy')));
});

test('high energy lifts shows and events', () => {
  const r = decideTonight({places: PLACES, events: [event(BENEDUM, '2026-11-13T23:00:00-05:00', {placeId: ''})], context: ctx({energy: 'high'}), seed: 2});
  assert.ok(r.picks.some(p => p.kind === 'event'));
  assert.ok(r.picks.some(p => p.place && groupOf(p.place) === 'culture'));
  assert.ok(r.explain.notes.some(x => x.startsWith('Up for anything')));
});

test('family nudges bars down when alternatives exist, and says so', () => {
  const places = [WARREN, BUTCHER, BIERGARTEN, CREATIVE, APOLLO, HARRIS];
  const r = decideTonight({places, context: ctx({location: null, companions: 'family'}), seed: 1});
  assert.ok(r.picks.every(p => groupOf(p.place) !== 'drinks'));
  assert.ok(r.explain.notes.some(x => x.startsWith('Family')));
});

test('companions only nudge: a lone bar is still offered to a family', () => {
  const r = decideTonight({places: [WARREN], context: ctx({companions: 'family'}), seed: 1});
  assert.equal(r.picks[0].place.id, WARREN.id);
});

test('reshuffle returns three different picks each time until the pool runs out', () => {
  const base = {places: PLACES.slice(0, 40), context: ctx(), seed: 9};
  const seen = new Set();
  let exclude = [];
  for (let round = 0; round < 4; round++) {
    const r = decideTonight({...base, exclude});
    assert.equal(r.explain.wrapped, false);
    for (const id of ids(r)) { assert.ok(!seen.has(id)); seen.add(id); }
    exclude = [...seen];
  }
  assert.equal(seen.size, 12);
});

test('reshuffle wraps when the pool is exhausted and says so', () => {
  const base = {places: [HEINZ, WARREN, CREATIVE, APOLLO], context: ctx(), seed: 1};
  const first = decideTonight(base);
  const second = decideTonight({...base, exclude: ids(first)});
  assert.equal(second.picks.length, 3);
  assert.equal(second.explain.wrapped, true);
  assert.match(second.explain.summary, /seen all 4 options/);
  assert.ok(!ids(first).includes(ids(second)[0]), 'the unseen option leads');
  const third = decideTonight({...base, exclude: [...ids(first), ...ids(second)]});
  assert.equal(third.explain.wrapped, true);
  assert.equal(third.picks.length, 3);
});

test('exclude also accepts raw record ids', () => {
  const r = decideTonight({places: [HEINZ, WARREN, CREATIVE, APOLLO], context: ctx(), exclude: [HEINZ.id, WARREN.id, CREATIVE.id], seed: 1});
  assert.equal(r.picks[0].place.id, APOLLO.id);
});

test('closed venues are hidden from picks while the save itself is untouched', () => {
  const row = CORRECTIONS[0];
  const closed = {...HEINZ, id: 'closed-venue', name: row.names[0], lat: row.lat, lng: row.lng, category: 'restaurant'};
  const kept = save(closed);
  const before = structuredClone(kept);
  const r = decideTonight({saves: [kept], places: [closed, WARREN], context: ctx(), seed: 1});
  assert.deepEqual(r.picks.map(p => p.place.id), [WARREN.id]);
  assert.deepEqual(kept, before);
});

test('two saves of the same place become one pick, newest save wins', () => {
  const older = save(WARREN, {savedAt: '2026-10-01T12:00:00Z'}), newer = save(WARREN, {savedAt: '2026-11-01T12:00:00Z'});
  const r = decideTonight({saves: [older, newer], places: [WARREN], context: ctx(), seed: 1});
  assert.equal(r.pool, 1);
  assert.equal(r.picks[0].save.id, newer.id);
});

test('only status "saved" records count as saves', () => {
  const notSave = {...save(WARREN), status: 'planned'};
  const r = decideTonight({saves: [notSave], context: ctx(), seed: 1});
  assert.equal(r.pool, 0);
});

test('empty input is honest and does not throw', () => {
  const r = decideTonight({context: ctx()});
  assert.deepEqual(r.picks, []);
  assert.equal(r.pool, 0);
  assert.match(r.explain.summary, /Nothing fits tonight yet/);
});

test('"now" must be an ISO time with an offset', () => {
  for (const now of ['', '2026-11-13', '2026-11-13T18:30:00', 'Friday']) assert.throws(() => decideTonight({context: ctx({now})}), /context\.now/);
  assert.doesNotThrow(() => decideTonight({context: ctx({now: '2026-11-13T23:30:00Z'})}));
});

test('reasons are capped at three', () => {
  const outings = [visit(BUTCHER, '2026-09-01', 5), plan(WARREN)];
  const r = decideTonight({saves: [save(WARREN, {savedAt: daysBefore(FRIDAY, 30), expiresAt: '2026-11-13'})], places: [WARREN], outings, context: ctx(), seed: 1});
  assert.ok(r.picks[0].reasons.length <= 3);
  assert.equal(r.picks[0].reasons[0], 'Last day today');
});

// Property-style: build many records with random subsets of fields and check
// that no reason ever mentions a fact the record or context does not carry.
test('reasons never mention data the record lacks', () => {
  let state = 12345;
  const rand = () => (state = (Math.imul(state, 1103515245) + 12345) >>> 0) / 4294967296;
  const pickOne = list => list[Math.floor(rand() * list.length)];
  const sample = PLACES.filter((_, i) => i % 7 === 0);
  for (let trial = 0; trial < 150; trial++) {
    const hasLocation = rand() < .5;
    const saves = Array.from({length: 1 + Math.floor(rand() * 3)}, () => {
      const source = {app: pickOne(['instagram', 'tiktok', 'youtube', 'google-maps', 'web', 'note'])};
      if (rand() < .5) source.savedAt = daysBefore(FRIDAY, Math.floor(rand() * 120));
      if (rand() < .3) source.eventDate = pickOne(['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-19']);
      if (rand() < .3) source.expiresAt = pickOne(['2026-11-13', '2026-11-16', '2026-11-18', '2026-11-25']);
      return save(rand() < .3 ? null : pickOne(sample), source);
    });
    const outings = rand() < .5 ? [visit(pickOne(sample), '2026-10-02', 1 + Math.floor(rand() * 5))] : [];
    const r = decideTonight({saves, places: sample, outings, context: ctx({location: hasLocation ? DOWNTOWN : null}), seed: trial});
    for (const pick of r.picks) {
      const text = pick.reasons.join(' | ');
      const src = pick.save?.source;
      assert.ok(!/open/i.test(text), text);
      if (!hasLocation) assert.ok(!/away/.test(text), text);
      if (!src?.savedAt) assert.ok(!/Saved (today|yesterday|\d)/.test(text), text);
      if (!src?.eventDate) assert.ok(!/Happening (today|tonight)|On \w+day \d/.test(text), text);
      if (!src?.expiresAt) assert.ok(!/Last day|closes|Ends/.test(text), text);
      if (pick.place) assert.ok(!/needs confirming/.test(text), text);
      if (!outings.some(o => o.place.id === pick.place?.id)) assert.ok(!/You (loved|liked) it|You went/.test(text), text);
      if (!outings.length) assert.ok(!/loved|liked/.test(text), text);
      if (pick.kind !== 'event') assert.ok(!/Starts|On now|Runs until|On today/.test(text), text);
      assert.ok(pick.reasons.length > 0, 'every pick has a reason');
    }
  }
});

// Review fixes: each case below failed on the builder's commit.
test('a visit dated after now is never described as "You went -N days ago"', () => {
  const r = decideTonight({places: [WARREN], outings: [visit(WARREN, '2026-11-20', 0)], context: ctx(), seed: 1});
  for (const reason of r.picks[0].reasons) assert.ok(!/-\d|You went/.test(reason), reason);
});

test('a daytime event is "today", not "tonight"', () => {
  const r = decideTonight({events: [event(HEINZ, '2026-11-14T11:00:00-05:00')], context: ctx({now: '2026-11-14T10:00:00-05:00'}), seed: 1});
  assert.equal(r.picks[0].reasons[0], 'Starts 11:00 am today');
});

test('event times use the venue clock across the November DST change', () => {
  // 00:30 EDT on 1 Nov 2026; the event is 1:30 am EST, after clocks go back.
  const r = decideTonight({events: [event(HEINZ, '2026-11-01T01:30:00-05:00')], context: ctx({now: '2026-11-01T00:30:00-04:00'}), seed: 1});
  assert.equal(r.picks[0].reasons[0], 'Starts 1:30 am tonight');
});

test('a UTC-stamped event is shown in the caller zone', () => {
  const r = decideTonight({events: [event(HEINZ, '2026-11-14T01:00:00Z')], context: ctx(), seed: 1});
  assert.equal(r.picks[0].reasons[0], 'Starts 8:00 pm tonight');
});

test('a long-running event under way gives its end date, not a bare time', () => {
  const r = decideTonight({events: [event(HEINZ, '2026-10-01T10:00:00-04:00', {end: '2027-01-01T17:00:00-05:00'})], context: ctx(), seed: 1});
  assert.equal(r.picks[0].reasons[0], 'Runs until Jan 1, 2027');
});

test('a past outing with a null category does not crash the engine', () => {
  const odd = {...COURTHOUSE, id: 'legacy-null-category', category: null};
  const r = decideTonight({places: [WARREN], outings: [visit(odd, '2026-11-01', 5)], context: ctx(), seed: 1});
  assert.equal(r.picks.length, 1);
});

test('an unresolved save with no known app does not claim it came from a link', () => {
  const r = decideTonight({saves: [{...save(null), source: {url: '', app: '', text: '', savedAt: '', eventDate: '', expiresAt: ''}}], context: ctx(), seed: 1});
  assert.deepEqual(r.picks[0].reasons, ['Saved · place still needs confirming']);
});

// Integration review (af6bb0d): each case below failed before the fix.
const EVENING_SAVE = {eventDate: '2026-11-13', savedAt: '2026-11-13T15:00:00Z'};
test('after midnight the Friday session is still open: a Friday save is not "passed"', () => {
  for (const now of ['2026-11-14T02:30:00-05:00', '2026-11-14T04:59:00-05:00']) {
    const r = decideTonight({saves: [save(null, EVENING_SAVE)], context: ctx({now}), seed: 1});
    assert.equal(r.picks.length, 1, now);
    assert.equal(r.picks[0].reasons[0], 'Happening tonight');
    assert.ok(!r.explain.notes.some(x => /passed/.test(x)));
  }
  const r = decideTonight({saves: [save(null, EVENING_SAVE)], context: ctx({now: '2026-11-14T05:00:00-05:00'}), seed: 1});
  assert.equal(r.picks.length, 0, 'at 5 am the session has reset');
  const sat = decideTonight({saves: [save(null, {eventDate: '2026-11-14'})], context: ctx({now: '2026-11-14T02:30:00-05:00'}), seed: 1});
  assert.equal(sat.picks[0].reasons[0], 'On Saturday, Nov 14', 'a Saturday save is not "today" before the user has slept');
});

test('save age counts calendar days in the caller zone, not 24-hour blocks', () => {
  const thursdayEvening = save(null, {app: 'note', savedAt: '2026-11-12T23:59:00Z'}); // Thu 18:59 EST
  assert.ok(decideTonight({saves: [thursdayEvening], context: ctx({now: '2026-11-13T18:10:00-05:00'}), seed: 1}).picks[0].reasons.includes('Saved yesterday'));
  const beforeMidnight = save(null, {app: 'note', savedAt: '2026-11-13T04:50:00Z'}); // Thu 23:50 EST
  assert.ok(decideTonight({saves: [beforeMidnight], context: ctx({now: '2026-11-13T00:20:00-05:00'}), seed: 1}).picks[0].reasons.includes('Saved yesterday'));
  const sameDay = save(null, {app: 'note', savedAt: '2026-11-13T05:10:00Z'}); // Fri 00:10 EST
  assert.ok(decideTonight({saves: [sameDay], context: ctx({now: '2026-11-13T23:50:00-05:00'}), seed: 1}).picks[0].reasons.includes('Saved today'));
  const yearOld = save(null, {app: 'note', savedAt: '2025-11-01T15:00:00Z'});
  assert.ok(decideTonight({saves: [yearOld], context: ctx(), seed: 1}).picks[0].reasons.includes('Saved a year ago'));
});

test('all-day events never get a clock time and only show on their own day', () => {
  const market = event(HEINZ, '2026-11-14T00:00:00-05:00', {end: '2026-11-15T00:00:00-05:00', allDay: true, title: 'Holiday Market'});
  assert.equal(decideTonight({events: [market], context: ctx({now: '2026-11-13T21:00:00-05:00'}), seed: 1}).pool, 0, 'not "starts 12:00 am tonight" the evening before');
  const sat = decideTonight({events: [market], context: ctx({now: '2026-11-14T19:00:00-05:00'}), seed: 1});
  assert.equal(sat.picks[0].reasons[0], 'On today');
  // The same listing without the flag (midnight to midnight) is read the same way.
  const unflagged = {...market, allDay: undefined};
  assert.equal(decideTonight({events: [unflagged], context: ctx({now: '2026-11-14T19:00:00-05:00'}), seed: 1}).picks[0].reasons[0], 'On today');
  const fair = event(HEINZ, '2026-11-13T00:00:00-05:00', {end: '2026-11-16T00:00:00-05:00', allDay: true});
  assert.equal(decideTonight({events: [fair], context: ctx(), seed: 1}).picks[0].reasons[0], 'Runs until Nov 15');
});

test('a multi-month exhibition is never "on now", even at 2:30 am', () => {
  const show = event(HEINZ, '2026-05-02T08:00:00-04:00', {end: '2027-01-03T17:00:00-05:00'});
  for (const now of ['2026-11-13T18:10:00-05:00', '2026-11-14T02:30:00-05:00']) {
    const reasons = decideTonight({events: [show], context: ctx({now}), seed: 1}).picks[0].reasons;
    assert.equal(reasons[0], 'Runs until Jan 3, 2027', now);
  }
});

test('events without coordinates are not exempt from distance', () => {
  const nowhere = {...event(HEINZ, '2026-11-13T20:00:00-05:00'), lat: null, lng: null, placeId: ''};
  const limited = decideTonight({events: [nowhere], places: [WARREN], context: ctx({maxKm: 1}), seed: 1});
  assert.ok(limited.picks.every(p => p.kind !== 'event'), 'left out under a distance limit');
  assert.ok(limited.explain.notes.some(x => /no map location/.test(x)));
  const open = decideTonight({events: [nowhere], context: ctx(), seed: 1});
  assert.ok(open.explain.notes.some(x => /distance is unknown/.test(x)));
  // A linked venue lends its coordinates.
  const linked = {...nowhere, placeId: HEINZ.id};
  const r = decideTonight({events: [linked], places: [HEINZ], context: ctx(), seed: 1});
  assert.ok(r.picks.find(p => p.kind === 'event').reasons.some(x => / away$/.test(x)));
});

test('a morning start the next day is not tonight for a caller in another zone', () => {
  const breakfast = event(HEINZ, '2026-11-18T07:45:00-05:00', {end: '2026-11-18T13:00:00-05:00'});
  assert.equal(decideTonight({events: [breakfast], context: ctx({now: '2026-11-17T23:00:00-08:00', location: null}), seed: 1}).pool, 0);
  assert.equal(decideTonight({events: [breakfast], context: ctx({now: '2026-11-17T23:00:00-05:00', location: null}), seed: 1}).pool, 0);
});

test('with no location and no history every pick still has a factual reason', () => {
  const r = decideTonight({places: PLACES, context: ctx({location: null}), seed: 0});
  for (const pick of r.picks) {
    assert.ok(pick.reasons.length > 0, pick.place.name);
    assert.match(pick.reasons[0], /^[A-Z][a-z ]+( in .+)?$/);
  }
});

test('"Like X" only compares a place with the same kind of place', () => {
  const outings = [visit(WARREN, '2026-09-01', 5)];
  const r = decideTonight({places: PLACES, outings, context: ctx({location: null}), seed: 1});
  for (const pick of r.picks) {
    if (pick.reasons.includes('Like The Warren, which you loved')) assert.equal(pick.place.category, WARREN.category);
  }
  const pub = decideTonight({places: [COURTHOUSE], outings, context: ctx({location: null}), seed: 1});
  assert.ok(!pub.picks[0].reasons.some(x => /^Like /.test(x)), 'a pub is not "like" a bar just because both are drinks');
  const bar = decideTonight({places: [BIERGARTEN], outings, context: ctx({location: null}), seed: 1});
  assert.ok(bar.picks[0].reasons.includes('Like The Warren, which you loved'), 'a bar is like a bar');
});

test('a low rating keeps out a duplicate record of the same venue', () => {
  const twin = {...WARREN, id: 'pack-warren-twin', name: `${WARREN.name} Bar & Burrow`, lat: WARREN.lat + 0.0001};
  const r = decideTonight({places: [twin, BUTCHER], outings: [visit(WARREN, '2026-09-01', 1)], context: ctx(), seed: 1});
  assert.deepEqual(r.picks.map(p => p.place.id), [BUTCHER.id]);
});
