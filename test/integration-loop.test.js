// The whole loop on real data, no network and no keys:
// save -> resolve -> decide tonight -> plan -> visit -> board -> decide again.
// Places come from the real Pittsburgh city pack, events from the recorded
// feeds in test/fixtures/events run through the real normalizers. The only
// simulated piece is the language model's reply, injected as data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseSaveUrl} from '../src/saveSource.js';
import {makeSave, attachPlace, saveToPlan, findDuplicate, dedupeKey} from '../src/saves.js';
import {validateOuting, validatePlace, validateBackup, backupPayload} from '../src/model.js';
import {accountBackup, readAccountBackup} from '../src/accountBackup.js';
import {resolveInput, checkCandidates} from '../server/resolve-save.js';
import {matchCandidates} from '../src/saveMatch.js';
import {decideTonight} from '../src/decide.js';
import {distance} from '../src/recommendations.js';
import {isSuppressedVenue} from '../src/venueCorrections.js';
import {boardFromPack, boardProgress, generateSets, milestones, nextUp, matchVisits, normalizeName, distanceM, kindPlural, MATCH_RADIUS_M} from '../src/cityBoard.js';
import {VENUE_KINDS, venueGroup, normalizeKind} from '../src/venues.js';
import {parseICal} from '../server/events/ical.js';
import {extractEvents} from '../server/events/jsonld.js';
import {normalizeTicketmaster} from '../server/events/ticketmaster.js';
import {mergeEvents, linkToPlace} from '../server/events/index.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const pack = JSON.parse(read('../data/city-packs/pittsburgh.json'));
const oldGuide = JSON.parse(read('../src/data/pittsburgh.json'));
const NY = 'America/New_York';
// Friday 6 November 2026, 6:30 pm in Pittsburgh. A past Friday, so a visit
// that evening is never a "future" memory whatever day the suite runs.
const NOW = '2026-11-06T18:30:00-05:00', nowMs = Date.parse(NOW), TODAY = '2026-11-06';
const DOWNTOWN = {lat: 40.4406, lng: -79.9959, city: 'Pittsburgh'};
const REEL = 'https://www.instagram.com/reel/DBx7Qk2Pp4L/?igsh=MWQ1ZGUxMzBkMA==';
const TIKTOK = 'https://www.tiktok.com/@pghfoodcrawl/video/7431234567890123456?is_from_webapp=1&sender_device=pc';

function tonightEvents() {
  const from = nowMs, to = Date.parse('2026-11-07T05:00:00-05:00');
  const ical = (file, sourceName, sourceUrl) => parseICal(read(`./fixtures/events/${file}`), {from, to, timeZone: NY, sourceName, sourceUrl, fetchedAt: '2026-11-12T00:03:58Z'}).events;
  const lists = [
    ical('shadyave.ics', 'Shady Ave', 'https://shadyave.com/events/month/?ical=1'),
    ical('sustainablepittsburgh.ics', 'Sustainable Pittsburgh', 'https://sustainablepittsburgh.org/events-calendar/?ical=1'),
    extractEvents(read('./fixtures/events/cityofasylum-events.html'), {baseUrl: 'https://cityofasylum.org/events/', sourceName: 'City of Asylum', fetchedAt: '2026-11-12T00:04:48Z', timeZone: NY, from, to}).events,
    normalizeTicketmaster(JSON.parse(read('./fixtures/events/ticketmaster-docs-derived.json')), {fetchedAt: '2026-11-12T00:00:00Z'}).events,
  ];
  return mergeEvents(lists).map(e => linkToPlace(e, pack.places));
}

// Simulate the model: what it would return for this caption. The real
// checks then decide what survives.
function resolve(save, modelReply) {
  const input = resolveInput({url: save.source.url, text: save.source.text, near: DOWNTOWN, today: TODAY}, {now: nowMs});
  const candidates = checkCandidates(modelReply, input);
  return {candidates, matched: matchCandidates(candidates, pack.places, input.near)};
}
const reply = (...candidates) => ({candidates: candidates.map(c => ({venue: '', city: '', dateText: '', eventDate: '', expiresAt: '', confidence: .9, ...c}))});

// Each reason must be a sentence decide.js can only write from real fields.
function assertBacked(pick, location, nowValue = nowMs) {
  for (const reason of pick.reasons) {
    let m;
    if ((m = /^Saved (today|yesterday|(\d+) days ago|(\d+) weeks ago)$/.exec(reason))) {
      const days = Math.floor((nowValue - Date.parse(pick.save.source.savedAt)) / 86400000);
      const expected = days === 0 ? 'today' : days === 1 ? 'yesterday' : days < 14 ? `${days} days ago` : `${Math.floor(days / 7)} weeks ago`;
      assert.equal(m[1], expected, reason);
    } else if ((m = /^Saved from (Instagram|TikTok|a note) · place still needs confirming$/.exec(reason))) {
      assert.equal(pick.place, undefined);
      assert.equal({Instagram: 'instagram', TikTok: 'tiktok', 'a note': 'note'}[m[1]], pick.save.source.app);
    } else if ((m = /^(\d+) m away$/.exec(reason))) {
      assert.ok(Math.abs(distance(location, pick.place || pick.event) * 1000 - Number(m[1])) <= 50, reason);
    } else if ((m = /^([\d.]+) km away$/.exec(reason))) {
      assert.ok(Math.abs(distance(location, pick.place || pick.event) - Number(m[1])) <= .06, reason);
    } else if ((m = /^On now until (\d+) (\w+)$/.exec(reason))) {
      assert.equal(pick.kind, 'event');
      assert.ok(Date.parse(pick.event.start) < nowValue && Date.parse(pick.event.end) > nowValue);
    } else if ((m = /^You went (today|yesterday|(\d+) days ago)$/.exec(reason))) {
      assert.ok(pick.place);
    } else if ((m = /^You rated it (\d) last time$/.exec(reason))) {
      assert.ok(pick.place);
    } else if ((m = /^At (.+)$/.exec(reason))) {
      assert.equal(m[1], pick.event.venueName);
    } else assert.fail(`Unbacked reason: ${reason}`);
  }
}
// The bar plus the first four open pack places 3-5 km from it: far enough
// that distance, not the 0-4 point tie-break jitter, orders them.
const aroundBar = bar => [bar, ...pack.places.filter(p => { const km = distance(bar, p); return km >= 3 && km <= 5 && !isSuppressedVenue(p, nowMs); }).slice(0, 4)];
const line = pick => `${pick.kind}: ${pick.place?.name || pick.event?.title || pick.save?.source.text || pick.save?.source.url} -- ${pick.reasons.join(' / ')}`;

test('every kind in the three city packs is understood by venues, the resolver, the matcher and the board', () => {
  for (const slug of ['pittsburgh', 'pittsburgh-metro', 'columbus']) {
    const data = slug === 'pittsburgh' ? pack : JSON.parse(read(`../data/city-packs/${slug}.json`));
    const kinds = new Set(data.places.map(p => p.category));
    for (const kind of kinds) {
      assert.equal(normalizeKind(kind), kind, `${slug}: ${kind} is already normalized`);
      assert.ok(VENUE_KINDS.has(kind), `${slug}: ${kind} is a venue kind the resolver may return`);
      assert.ok(venueGroup(kind), `${slug}: ${kind} has a group for decide and the board`);
      assert.doesNotMatch(kindPlural(kind), /ridings$/);
    }
    const board = boardFromPack(data);
    assert.equal(board.skipped, 0, `${slug}: the board keeps every pack place`);
    assert.equal(board.total, data.places.length);
    assert.equal(board.cityId, data.slug);
    assert.equal(board.edition, data.release);
  }
});

test('the loop: save, resolve, decide, plan, visit, board, decide again', t => {
  // a. Saves from a reel, a TikTok and a typed note.
  assert.deepEqual(parseSaveUrl(REEL), {app: 'instagram', kind: 'reel', id: 'DBx7Qk2Pp4L', canonicalUrl: 'https://www.instagram.com/reel/DBx7Qk2Pp4L/', hint: ''});
  assert.deepEqual(parseSaveUrl(TIKTOK), {app: 'tiktok', kind: 'video', id: '7431234567890123456', canonicalUrl: 'https://www.tiktok.com/@pghfoodcrawl/video/7431234567890123456', hint: '@pghfoodcrawl'});
  const reel = makeSave({url: REEL, text: 'Butcher and the Rye has the best bourbon wall in the city 🥃', now: '2026-10-16T22:00:00Z'});
  const clip = makeSave({url: TIKTOK, text: 'this taco spot though 🌮🔥', now: '2026-11-04T23:10:00Z'});
  const note = makeSave({text: 'Cafe Milano with Sam', now: '2026-11-06T15:00:00Z'});
  assert.deepEqual([reel.source.app, clip.source.app, note.source.app], ['instagram', 'tiktok', 'note']);
  assert.ok([reel, clip, note].every(s => s.status === 'saved' && s.place === null));
  let pile = [reel, clip, note];
  // A re-share carries other tracking and may be pasted without https://.
  const again = makeSave({url: 'instagram.com/reels/DBx7Qk2Pp4L?utm_source=ig_web_copy_link&igsh=b3RoZXI=', now: NOW});
  assert.equal(findDuplicate(pile, again)?.id, reel.id);
  const clipAgain = makeSave({url: 'https://www.tiktok.com/@pghfoodcrawl/video/7431234567890123456?_r=1&_t=ZT-8xyz&u_code=abc&tt_from=copy', now: NOW});
  assert.equal(findDuplicate(pile, clipAgain)?.id, clip.id);
  assert.equal(findDuplicate(pile, makeSave({text: '  cafe milano  WITH sam', now: NOW}))?.id, note.id);

  // b. "Is this the place?" The model reply is injected; a name the caption
  // never mentions is dropped by the real checks before matching.
  const fromReel = resolve(reel, reply({name: 'Butcher and the Rye', kind: 'bar', evidence: 'Butcher and the Rye'}, {name: 'Meat & Potatoes', kind: 'restaurant', evidence: 'Meat & Potatoes'}));
  assert.deepEqual(fromReel.candidates.map(c => c.name), ['Butcher and the Rye']);
  const [hit] = fromReel.matched;
  assert.equal(hit.ambiguous, false);
  const butcher = hit.matches[0].place;
  assert.equal(butcher.name, 'Butcher and the Rye');
  assert.ok(butcher.id.startsWith('overture-'));
  assert.match(hit.matches[0].reason, /^same name · \d+ m away$/);
  const fromNote = resolve(note, reply({name: 'Cafe Milano', kind: 'restaurant', evidence: 'Cafe Milano'}));
  const milano = fromNote.matched[0].matches[0].place;
  assert.equal(fromNote.matched[0].ambiguous, false);
  assert.equal(milano.name, 'Cafe Milano');
  const fromClip = resolve(clip, reply());
  assert.deepEqual(fromClip.matched, []);
  const resolvedReel = attachPlace(reel, butcher, '2026-10-16T22:01:00Z');
  const resolvedNote = attachPlace(note, milano, '2026-11-06T15:01:00Z');
  assert.equal(resolvedReel.place.id, butcher.id);
  assert.equal(resolvedReel.place.category, 'pub');
  assert.deepEqual([resolvedReel.place.lat, resolvedReel.place.lng], [butcher.lat, butcher.lng]);
  assert.equal(dedupeKey(resolvedReel), dedupeKey(reel), 'the link, not the venue, stays the identity');
  pile = [resolvedReel, clip, resolvedNote];

  // c. Tonight's Three.
  const events = tonightEvents();
  assert.ok(events.length >= 1);
  const context = {now: NOW, location: DOWNTOWN};
  const first = decideTonight({saves: pile, places: pack.places, events, outings: [], context, seed: 0});
  t.diagnostic(`5c ${first.explain.summary}`);
  for (const pick of first.picks) t.diagnostic(`5c ${line(pick)}`);
  assert.equal(first.picks.length, 3);
  assert.deepEqual(first.picks.map(p => p.kind), ['save', 'save', 'save']);
  assert.deepEqual(new Set(first.picks.map(p => p.save.id)), new Set(pile.map(s => s.id)));
  const unresolved = first.picks.find(p => p.save.id === clip.id);
  assert.equal(unresolved.place, undefined);
  assert.ok(unresolved.reasons.includes('Saved from TikTok · place still needs confirming'));
  for (const pick of first.picks) assertBacked(pick, DOWNTOWN);
  // Nothing else outranks a save: the best non-save scores below the worst save.
  const rest = decideTonight({saves: pile, places: pack.places, events, outings: [], context, seed: 0, exclude: pile.map(s => `save:${s.id}`)});
  assert.equal(rest.explain.wrapped, false);
  assert.ok(rest.picks.every(p => p.kind !== 'save'));
  assert.ok(Math.max(...rest.picks.map(p => p.score)) < Math.min(...first.picks.map(p => p.score)));
  // The recorded Shady Ave exhibition is on tonight and reaches the picks once saves are set aside.
  const show = rest.picks.find(p => p.kind === 'event');
  assert.ok(show, 'a real event from the fixtures is offered');
  assert.equal(show.event.venueName, 'Carnegie Museum of Art');
  for (const pick of rest.picks) assertBacked(pick, DOWNTOWN);

  // d. Plan it, go, remember it; it survives both backup formats.
  const plan = saveToPlan(resolvedReel, TODAY, NOW);
  assert.equal(plan.status, 'planned');
  assert.deepEqual(plan.source, resolvedReel.source);
  const visit = validateOuting({...plan, status: 'visited', visitDate: TODAY, rating: 4, with: 'Sam', updatedAt: '2026-11-07T02:00:00.000Z'});
  const journal = [visit, clip, resolvedNote];
  const restored = validateBackup(JSON.parse(JSON.stringify(backupPayload({outings: journal}))));
  assert.deepEqual(restored, journal);
  assert.deepEqual(readAccountBackup(JSON.parse(JSON.stringify(accountBackup({outings: journal})))), journal);

  // e. The city board from the same pack.
  const board = boardFromPack(pack);
  const progress = boardProgress(board, journal);
  const hood = progress.byNeighborhood.find(n => n.name === pack.places.find(p => p.id === butcher.id).neighborhood);
  t.diagnostic(`5e ${progress.cityId} ${progress.edition}: ${progress.done} of ${progress.total} places (${progress.percent}%) · ${hood.name} ${hood.done}/${hood.total} · first: ${progress.firsts.map(f => `${f.name}, ${f.neighborhood}, ${f.visitDate}`).join('; ')}`);
  assert.equal(progress.done, 1);
  assert.equal(progress.byKind.find(k => k.kind === 'pub').done, 1);
  assert.deepEqual(progress.recent.map(r => r.placeId), [butcher.id]);
  const sets = generateSets(board);
  assert.ok(sets.length > 0);
  assert.ok(milestones(board, journal).some(m => /first/i.test(JSON.stringify(m))));
  const next = nextUp(board, journal, {location: DOWNTOWN});
  assert.equal(next.length, 3);
  assert.ok(next.every(n => n.place.id !== butcher.id));
  // The same bar from the old hand-made guide, under its old id.
  const old = oldGuide.places.find(p => normalizeName(p.name) === normalizeName(butcher.name) && distanceM(p, butcher) <= MATCH_RADIUS_M);
  assert.ok(old && old.id !== butcher.id && old.id.startsWith('ofm-'));
  const oldVisit = validateOuting({id: 'old-guide-visit', place: validatePlace(old), status: 'visited', planDate: '', visitDate: '2026-10-02', notes: '', with: '', rating: 5, photos: [], createdAt: '2026-10-03T00:00:00.000Z', updatedAt: '2026-10-03T00:00:00.000Z'});
  const both = [...journal, oldVisit];
  const twice = boardProgress(board, both);
  assert.equal(twice.done, 1, 'two visits to one venue count once');
  assert.deepEqual(twice.recent, [{placeId: butcher.id, name: butcher.name, neighborhood: hood.name, visitDate: '2026-10-02'}]);
  assert.equal(matchVisits(board.places, [oldVisit]).get(butcher.id).via, 'name');
  assert.deepEqual(milestones(board, both), milestones(board, [oldVisit]));

  // f. Tonight again: the bar you just went to drops out and the picks change.
  const savesNow = journal.filter(o => o.status === 'saved');
  const second = decideTonight({saves: savesNow, places: pack.places, events, outings: journal, context, seed: 0});
  for (const pick of second.picks) t.diagnostic(`5f ${line(pick)}`);
  assert.notDeepEqual(second.picks.map(p => p.id), first.picks.map(p => p.id));
  assert.ok(second.picks.every(p => p.place?.id !== butcher.id));
  for (const pick of second.picks) assertBacked(pick, DOWNTOWN);
  // Standing at the bar, it is the first pick until you have been; after
  // that it is deprioritised, whether the visit used the pack id or the old guide's.
  const atBar = {now: NOW, location: {lat: butcher.lat, lng: butcher.lng}};
  const before = decideTonight({places: aroundBar(butcher), context: atBar, seed: 0});
  assert.equal(before.picks[0].place.id, butcher.id);
  for (const outings of [[visit], [oldVisit]]) {
    const after = decideTonight({places: aroundBar(butcher), outings, context: atBar, seed: 0});
    assert.ok(after.picks.every(p => p.place.id !== butcher.id), `visit under ${outings[0].place.id}`);
  }
});

test('decide recognises a journal record saved under another guide\'s id for the same venue', () => {
  const butcher = pack.places.find(p => p.name === 'Butcher and the Rye');
  const old = oldGuide.places.find(p => p.name === 'Butcher and the Rye');
  const lowRated = validateOuting({id: 'v1', place: validatePlace(old), status: 'visited', planDate: '', visitDate: '2026-09-01', notes: '', with: '', rating: 1, photos: [], createdAt: '2026-09-02T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z'});
  const context = {now: NOW, location: {lat: butcher.lat, lng: butcher.lng}};
  const all = decideTonight({places: aroundBar(butcher), outings: [lowRated], context, seed: 0});
  assert.ok(all.picks.every(p => p.place.id !== butcher.id));
  // A far-away namesake is a different place and keeps its own history.
  const elsewhere = {...validatePlace(old), lat: old.lat + .01};
  const other = decideTonight({places: aroundBar(butcher), outings: [{...lowRated, place: elsewhere}], context, seed: 0});
  assert.equal(other.picks[0].place.id, butcher.id);
});
