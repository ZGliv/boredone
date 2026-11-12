// The whole loop on real data, no network and no keys:
// save -> resolve -> decide tonight -> plan -> visit -> board -> decide again.
// Places come from the real Pittsburgh city pack, events from the recorded
// feeds in test/fixtures/events run through the real normalizers. The only
// simulated pieces are the language model's reply, injected as data, and one
// clearly labelled synthetic listing at a pack venue (the recorded feeds carry
// no coordinates, so venue links could not be exercised otherwise).
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
import {placeKind} from '../src/exploration.js';
import {boardFromPack, boardProgress, generateSets, milestones, nextUp, matchVisits, sameVenue, kindPlural} from '../src/cityBoard.js';
import {VENUE_KINDS, venueGroup, normalizeKind} from '../src/venues.js';
import {parseICal} from '../server/events/ical.js';
import {extractEvents} from '../server/events/jsonld.js';
import {normalizeTicketmaster} from '../server/events/ticketmaster.js';
import {mergeEvents, linkToPlace} from '../server/events/index.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const pack = JSON.parse(read('../data/city-packs/pittsburgh.json'));
const columbus = JSON.parse(read('../data/city-packs/columbus.json'));
const oldGuide = JSON.parse(read('../src/data/pittsburgh.json'));
const NY = 'America/New_York';
// Friday 6 November 2026, 6:30 pm in Pittsburgh. A past Friday, so a visit
// that evening is never a "future" memory whatever day the suite runs.
const NOW = '2026-11-06T18:30:00-05:00', nowMs = Date.parse(NOW), TODAY = '2026-11-06';
const DOWNTOWN = {lat: 40.4406, lng: -79.9959, city: 'Pittsburgh'};
const REEL = 'https://www.instagram.com/reel/DBx7Qk2Pp4L/?igsh=MWQ1ZGUxMzBkMA==';
const TIKTOK = 'https://www.tiktok.com/@pghfoodcrawl/video/7431234567890123456?is_from_webapp=1&sender_device=pc';
const packPlace = name => { const p = pack.places.find(x => x.name === name); assert.ok(p, `pack has ${name}`); return p; };
const oldPlace = name => { const p = oldGuide.places.find(x => x.name === name); assert.ok(p, `old guide has ${name}`); return p; };

function tonightEvents(from = nowMs, to = Date.parse('2026-11-07T05:00:00-05:00')) {
  const ical = (file, sourceName, sourceUrl) => parseICal(read(`./fixtures/events/${file}`), {from, to, timeZone: NY, sourceName, sourceUrl, fetchedAt: '2026-11-12T00:03:58Z'}).events;
  const lists = [
    ical('shadyave.ics', 'Shady Ave', 'https://shadyave.com/events/month/?ical=1'),
    ical('sustainablepittsburgh.ics', 'Sustainable Pittsburgh', 'https://sustainablepittsburgh.org/events-calendar/?ical=1'),
    extractEvents(read('./fixtures/events/cityofasylum-events.html'), {baseUrl: 'https://cityofasylum.org/events/', sourceName: 'City of Asylum', fetchedAt: '2026-11-12T00:04:48Z', timeZone: NY, from, to}).events,
    normalizeTicketmaster(JSON.parse(read('./fixtures/events/ticketmaster-docs-derived.json')), {fetchedAt: '2026-11-12T00:00:00Z'}).events,
  ];
  return mergeEvents(lists).map(e => linkToPlace(e, pack.places));
}
// Synthetic, labelled: a timed listing at a real pack venue, through the real
// Ticketmaster normalizer and venue linker.
function syntheticShowAt(place, startUtc) {
  const data = {_embedded: {events: [{id: 'synthetic-integration-show', name: 'Synthetic test listing', dates: {start: {dateTime: startUtc}, timezone: NY}, _embedded: {venues: [{name: place.name, location: {latitude: String(place.lat), longitude: String(place.lng)}}]}}]}};
  return normalizeTicketmaster(data, {fetchedAt: '2026-11-06T12:00:00Z'}).events.map(e => linkToPlace(e, pack.places));
}

// Simulate the model: what it would return for this caption. The real
// checks then decide what survives.
function resolve(save, modelReply) {
  const input = resolveInput({url: save.source.url, text: save.source.text, near: DOWNTOWN, today: TODAY}, {now: nowMs});
  const candidates = checkCandidates(modelReply, input);
  return {candidates, matched: matchCandidates(candidates, pack.places, input.near)};
}
const reply = (...candidates) => ({candidates: candidates.map(c => ({venue: '', city: '', dateText: '', eventDate: '', expiresAt: '', confidence: .9, ...c}))});

// Independent clock helpers: Intl in the venue zone, not decide.js's offset maths.
const nyParts = ms => Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone: NY, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'long'}).formatToParts(ms).map(p => [p.type, p.value]));
const nyDate = ms => { const p = nyParts(ms); return `${p.year}-${p.month}-${p.day}`; };
const dayGap = (later, earlier) => Math.round((Date.parse(later + 'T12:00:00Z') - Date.parse(earlier + 'T12:00:00Z')) / 86400000);
const sessionDate = ms => nyDate(ms - 5 * 3600000);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (date, now) => `${Number(date.slice(8))} ${MON[Number(date.slice(5, 7)) - 1]}${date.slice(0, 4) === nyDate(now).slice(0, 4) ? '' : ` ${date.slice(0, 4)}`}`;
const clockLabel = ms => { const p = nyParts(ms), h = Number(p.hour); return `${h % 12 || 12}:${p.minute} ${h < 12 ? 'am' : 'pm'}`; };
const ageLabel = days => days === 0 ? 'today' : days === 1 ? 'yesterday' : days < 14 ? `${days} days ago` : days < 60 ? `${Math.floor(days / 7)} weeks ago` : days < 365 ? `${Math.min(11, Math.floor(days / 30))} month${Math.floor(days / 30) === 1 ? '' : 's'} ago` : days < 730 ? 'a year ago' : `${Math.floor(days / 365)} years ago`;
const isVenue = (a, b) => !!a && !!b && (a.id === b.id || !!sameVenue(a, [b]));

// Each reason must be a sentence the record and context actually support,
// recomputed here from the data, never by repeating decide.js's formula.
function assertBacked(pick, {location = DOWNTOWN, now = nowMs, outings = [], saves = []} = {}) {
  assert.ok(pick.reasons.length > 0, `${pick.id} has at least one reason`);
  const src = pick.save?.source, ev = pick.event, place = pick.place;
  const visitsHere = outings.filter(o => o.status === 'visited' && isVenue(o.place, place || (ev?.placeId && pack.places.find(p => p.id === ev.placeId))));
  for (const reason of pick.reasons) {
    let m;
    if ((m = /^Saved (.+)$/.exec(reason)) && !/needs confirming$/.test(reason)) {
      assert.equal(m[1], ageLabel(dayGap(nyDate(now), nyDate(Date.parse(src.savedAt)))), reason);
    } else if ((m = /^Saved from (Instagram|TikTok|a note) · place still needs confirming$/.exec(reason))) {
      assert.equal(place, undefined);
      assert.equal({Instagram: 'instagram', TikTok: 'tiktok', 'a note': 'note'}[m[1]], src.app);
    } else if (reason === 'Happening today' || reason === 'Happening tonight') {
      assert.equal(src.eventDate, sessionDate(now));
      assert.equal(reason === 'Happening tonight', Number(nyParts(now).hour) < 5);
    } else if (reason === 'Last day today' || reason === 'Final night tonight') {
      assert.equal(src.expiresAt, sessionDate(now));
    } else if (reason === 'Last weekend before it closes') {
      const gap = dayGap(src.expiresAt, sessionDate(now));
      assert.ok(gap > 0 && gap <= 9, reason);
    } else if ((m = /^Ends (tomorrow|in (\d+) days)$/.exec(reason))) {
      assert.equal(dayGap(src.expiresAt, sessionDate(now)), m[2] ? Number(m[2]) : 1);
    } else if ((m = /^On (\w+day) (\d+ \w{3}(?: \d{4})?)$/.exec(reason))) {
      assert.equal(m[1], nyParts(Date.parse(src.eventDate + 'T12:00:00-05:00')).weekday);
      assert.equal(m[2], dayLabel(src.eventDate, now));
      assert.ok(src.eventDate > sessionDate(now), 'a day other than tonight');
    } else if ((m = /^(\d+) m away$/.exec(reason))) {
      assert.ok(Math.abs(distance(location, ev?.lat != null ? ev : place) * 1000 - Number(m[1])) <= 50, reason);
    } else if ((m = /^([\d.]+) km away$/.exec(reason))) {
      assert.ok(Math.abs(distance(location, ev?.lat != null ? ev : place) - Number(m[1])) <= .06, reason);
    } else if ((m = /^Starts (\d+:\d\d [ap]m) (tonight|today)$/.exec(reason))) {
      const start = Date.parse(ev.start);
      assert.ok(start >= now && sessionDate(start) === sessionDate(now), reason);
      assert.equal(m[1], clockLabel(start));
      assert.equal(m[2], Number(nyParts(start).hour) >= 17 || Number(nyParts(start).hour) < 5 ? 'tonight' : 'today');
    } else if ((m = /^On now until (\d+:\d\d [ap]m)$/.exec(reason))) {
      const start = Date.parse(ev.start), end = Date.parse(ev.end);
      assert.ok(start < now && end > now && end - start <= 18 * 3600000, reason);
      assert.equal(m[1], clockLabel(end));
    } else if ((m = /^Runs until (.+)$/.exec(reason))) {
      const end = Date.parse(ev.end), last = nyDate(ev.allDay ? end - 1 : end);
      assert.ok(Date.parse(ev.start) < Math.max(now, Date.parse(ev.start) + 1) && end > now, reason);
      assert.ok(ev.allDay || end - Date.parse(ev.start) > 18 * 3600000, 'only long or all-day events "run"');
      assert.equal(m[1], dayLabel(last, now));
    } else if (reason === 'On today') {
      assert.ok(ev.allDay && nyDate(Date.parse(ev.start)) === sessionDate(now));
    } else if ((m = /^You went (today|yesterday|(\d+) days ago)$/.exec(reason))) {
      const last = visitsHere.map(o => o.visitDate).sort().at(-1);
      assert.ok(last, `${reason}: there is a visit to ${place.name}`);
      assert.equal(m[1], ageLabel(dayGap(nyDate(now), last)));
    } else if ((m = /^You rated it (\d) last time$/.exec(reason))) {
      const rated = visitsHere.filter(o => o.rating > 0).sort((a, b) => a.visitDate.localeCompare(b.visitDate)).at(-1);
      assert.equal(rated?.rating, Number(m[1]), reason);
    } else if ((m = /^You rated (.+) (\d) last time$/.exec(reason))) {
      assert.equal(m[1], ev.venueName);
      assert.equal(visitsHere.filter(o => o.rating > 0).sort((a, b) => a.visitDate.localeCompare(b.visitDate)).at(-1)?.rating, Number(m[2]));
    } else if ((m = /^Like (.+), which you rated (\d)$/.exec(reason))) {
      const liked = outings.find(o => o.status === 'visited' && o.place.name === m[1] && o.rating === Number(m[2]));
      assert.ok(liked, reason);
      assert.equal(normalizeKind(liked.place.category), normalizeKind(place.category), 'same kind of place');
    } else if (reason === 'At a place you saved') {
      assert.ok(saves.some(s => s.place && s.place.id === ev.placeId));
    } else if ((m = /^At (.+)$/.exec(reason))) {
      assert.equal(m[1], ev.venueName);
    } else if ((m = /^([A-Z][a-z ]+?)(?: in (.+))?$/.exec(reason)) && place) {
      assert.equal(m[1].toLowerCase(), normalizeKind(place.category).replace(/_/g, ' '));
      assert.equal(m[2], place.neighborhood);
    } else assert.fail(`Unbacked reason: ${reason}`);
  }
}
// The bar plus the first four open pack places 3-5 km from it: far enough
// that distance, not the 0-4 point tie-break jitter, orders them.
const aroundBar = bar => [bar, ...pack.places.filter(p => { const km = distance(bar, p); return km >= 3 && km <= 5 && !isSuppressedVenue(p, nowMs); }).slice(0, 4)];
const line = pick => `${pick.kind}: ${pick.place?.name || pick.event?.title || pick.save?.source.text || pick.save?.source.url} -- ${pick.reasons.join(' / ')}`;
const visitTo = (place, visitDate, rating, id = `visit-${place.id}`) => validateOuting({id, place: validatePlace(place), status: 'visited', planDate: '', visitDate, notes: '', with: '', rating, photos: [], createdAt: `${visitDate}T23:00:00.000Z`, updatedAt: `${visitDate}T23:00:00.000Z`});

test('every kind in the three city packs is understood by venues, the resolver, the matcher, exploration and the board', () => {
  const LANDMARK = {food: 'cafe', coffee: 'cafe', drinks: 'cafe', culture: 'gallery', play: 'play'};
  for (const slug of ['pittsburgh', 'pittsburgh-metro', 'columbus']) {
    const data = slug === 'pittsburgh' ? pack : JSON.parse(read(`../data/city-packs/${slug}.json`));
    const kinds = new Set(data.places.map(p => p.category));
    for (const kind of kinds) {
      assert.equal(normalizeKind(kind), kind, `${slug}: ${kind} is already normalized`);
      assert.ok(VENUE_KINDS.has(kind), `${slug}: ${kind} is a venue kind the resolver may return`);
      assert.ok(venueGroup(kind), `${slug}: ${kind} has a group for decide and the board`);
      assert.equal(placeKind(kind), LANDMARK[venueGroup(kind)], `${slug}: ${kind} files under its group's landmark (shortlist, stamps, place pool)`);
      assert.doesNotMatch(kindPlural(kind), /ridings$/);
    }
    const board = boardFromPack(data);
    assert.equal(board.skipped, 0, `${slug}: the board keeps every pack place`);
    assert.equal(board.total, data.places.length);
    assert.equal(board.cityId, data.slug);
    assert.equal(board.edition, data.release);
    assert.doesNotMatch(board.cityName, /,| metro$/, `${slug}: labels use the short city name`);
    for (const set of generateSets(board)) assert.doesNotMatch(set.name, /, [A-Z]{2}\b|metro's/, set.name);
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
  for (const pick of first.picks) assertBacked(pick, {saves: pile});
  // Nothing else outranks a save: the best non-save scores below the worst save.
  const rest = decideTonight({saves: pile, places: pack.places, events, outings: [], context, seed: 0, exclude: pile.map(s => `save:${s.id}`)});
  for (const pick of rest.picks) t.diagnostic(`5c-rest ${line(pick)}`);
  assert.equal(rest.explain.wrapped, false);
  assert.ok(rest.picks.every(p => p.kind !== 'save'));
  assert.ok(Math.max(...rest.picks.map(p => p.score)) < Math.min(...first.picks.map(p => p.score)));
  for (const pick of rest.picks) assertBacked(pick, {saves: pile});
  // The recorded Carnegie International (May to January, no coordinates) is
  // in the pool as a run, never "on now", and its unknown distance is said.
  const exhibition = rest.pool && decideTonight({events: events.filter(e => e.venueName === 'Carnegie Museum of Art'), context, seed: 0});
  assert.equal(exhibition.picks[0].reasons[0], 'Runs until 3 Jan 2027');
  assertBacked(exhibition.picks[0]);
  assert.ok(exhibition.explain.notes.some(n => /distance is unknown/.test(n)));

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
  const old = oldPlace('Butcher and the Rye');
  assert.ok(old.id !== butcher.id && old.id.startsWith('ofm-'));
  const oldVisit = visitTo(old, '2026-10-02', 5, 'old-guide-visit');
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
  for (const pick of second.picks) assertBacked(pick, {outings: journal, saves: savesNow});
  // Standing at the bar, it is the first pick until you have been; after
  // that it is deprioritised, whether the visit used the pack id or the old guide's.
  const atBar = {now: NOW, location: {lat: butcher.lat, lng: butcher.lng}};
  const before = decideTonight({places: aroundBar(butcher), context: atBar, seed: 0});
  assert.equal(before.picks[0].place.id, butcher.id);
  for (const outings of [[visit], [oldVisit]]) {
    const after = decideTonight({places: aroundBar(butcher), outings, context: atBar, seed: 0});
    assert.ok(after.picks.every(p => p.place.id !== butcher.id), `visit under ${outings[0].place.id}`);
    for (const pick of after.picks) assertBacked(pick, {location: atBar.location, outings});
  }
});

test('decide recognises a journal record saved under another guide\'s id for the same venue', () => {
  const butcher = packPlace('Butcher and the Rye');
  const old = oldPlace('Butcher and the Rye');
  const lowRated = visitTo(old, '2026-09-01', 1, 'v1');
  const context = {now: NOW, location: {lat: butcher.lat, lng: butcher.lng}};
  const all = decideTonight({places: aroundBar(butcher), outings: [lowRated], context, seed: 0});
  assert.ok(all.picks.every(p => p.place.id !== butcher.id));
  // A far-away namesake is a different place and keeps its own history.
  const elsewhere = {...validatePlace(old), lat: old.lat + .01};
  const other = decideTonight({places: aroundBar(butcher), outings: [{...lowRated, place: elsewhere}], context, seed: 0});
  assert.equal(other.picks[0].place.id, butcher.id);
});

// Old-guide records whose pack copy is named a little differently. Each of
// these counted zero on the board and was recommended "like itself" before.
const NEAR_PAIRS = [
  ['Heinz Hall', 'Heinz Hall for the Performing Arts'],
  ['Greer Cabaret Theatre', 'Greer Cabaret Theater'],
  ['Fogo de Chão', 'Fogo de Chao Brazilian Steakhouse'],
  ['Benedum Center', 'Benedum Center for the Performing Arts'],
  ['Arcade Comedy Theatre', 'Arcade Comedy Theater'],
  ["DiBella's", "DiBella's Subs"],
];

test('every old-guide venue that has a pack copy counts exactly once on the board', () => {
  const board = boardFromPack(pack);
  let paired = 0;
  const byPack = new Map();
  for (const old of oldGuide.places) {
    const hit = sameVenue(old, board.places);
    if (!hit) continue;
    paired++;
    const earned = matchVisits(board.places, [visitTo(old, '2026-10-02', 4)]);
    assert.equal(earned.size, 1, old.name);
    assert.equal([...earned.keys()][0], hit.place.id, old.name);
    byPack.set(hit.place.id, [...(byPack.get(hit.place.id) || []), old]);
  }
  // Over 70% of the old guide now carries over (320 of 597 matched before).
  assert.ok(paired >= 420, `${paired} of ${oldGuide.places.length} old-guide venues pair with the pack`);
  for (const [oldName, packName] of NEAR_PAIRS) {
    const old = oldPlace(oldName), copy = packPlace(packName);
    assert.equal(sameVenue(old, board.places)?.place.id, copy.id, oldName);
    assert.equal(boardProgress(board, [visitTo(old, '2026-11-05', 5)]).done, 1, oldName);
    // Two old records that are one pack venue still count once.
    assert.equal(boardProgress(board, [visitTo(old, '2026-11-05', 5, 'a'), visitTo(copy, '2026-11-04', 5, 'b')]).done, 1, oldName);
  }
});

test('decide treats an old-guide memory as history for the pack copy: low ratings exclude, recent visits are named', () => {
  const at = '2026-11-06T18:30:00-05:00';
  for (const [oldName, packName] of NEAR_PAIRS) {
    const old = oldPlace(oldName), copy = packPlace(packName);
    const context = {now: at, location: {lat: copy.lat, lng: copy.lng}};
    const places = aroundBar(copy);
    const disliked = decideTonight({places, outings: [visitTo(old, '2026-09-01', 1)], context, seed: 0});
    assert.ok(disliked.picks.every(p => p.place.id !== copy.id), `${oldName} rated 1 keeps ${packName} out`);
    const outings = [visitTo(old, '2026-11-05', 5)];
    const loved = decideTonight({places: [copy], outings, context, seed: 0});
    const pick = loved.picks.find(p => p.place.id === copy.id);
    assert.ok(pick, packName);
    assert.ok(pick.reasons.includes('You went yesterday'), `${packName}: ${pick.reasons}`);
    assert.ok(!pick.reasons.some(r => r.startsWith('Like ')), `${packName} is not "like" itself`);
    for (const p of loved.picks) assertBacked(p, {location: context.location, outings});
  }
});

test('an event at a pack venue links to it: saved venue, rating and low-rating exclusion all apply', () => {
  const hall = packPlace('Heinz Hall for the Performing Arts'), oldHall = oldPlace('Heinz Hall');
  const [show] = syntheticShowAt(hall, '2026-11-07T01:00:00Z');
  assert.equal(show.placeId, hall.id);
  assert.equal(show.allDay, false);
  const context = {now: NOW, location: DOWNTOWN};
  const saved = makeSave({url: 'https://www.instagram.com/reel/HALL123/', place: hall, now: '2026-10-01T12:00:00Z'});
  const r = decideTonight({saves: [saved], events: [show], context, seed: 0});
  const ev = r.picks.find(p => p.kind === 'event');
  assert.deepEqual(ev.reasons, ['Starts 8:00 pm tonight', 'At a place you saved', `${Math.round(distance(DOWNTOWN, hall) * 20) * 50} m away`]);
  for (const pick of r.picks) assertBacked(pick, {saves: [saved]});
  const fan = [visitTo(oldHall, '2026-10-20', 5)];
  const rated = decideTonight({events: [show], outings: fan, context, seed: 0});
  assert.ok(rated.picks[0].reasons.includes('You rated Heinz Hall for the Performing Arts 5 last time'), rated.picks[0].reasons.join(' / '));
  assertBacked(rated.picks[0], {outings: fan});
  assert.equal(decideTonight({events: [show], outings: [visitTo(oldHall, '2026-10-20', 2)], context, seed: 0}).pool, 0, 'a low-rated venue keeps its events out');
});

test('dated saves read exactly right through the week, across midnight and the 5 am reset', () => {
  const at = (text, extra) => makeSave({text, now: '2026-11-12T23:59:00Z', ...extra}); // Thursday 18:59 in Pittsburgh
  const saves = [
    at('DJ set at Spirits & Tales tonight', {eventDate: '2026-11-13'}),
    at('Pop-up closes Sunday', {expiresAt: '2026-11-15'}),
    at('Market on Saturday', {eventDate: '2026-11-14'}),
    at('Show next Thursday', {eventDate: '2026-11-19'}),
    at('Closes Tuesday', {expiresAt: '2026-11-17'}),
  ];
  const run = now => {
    const r = decideTonight({saves, context: {now}, seed: 0});
    const out = new Map();
    for (const s of saves) {
      const pick = decideTonight({saves: [s], context: {now}, seed: 0}).picks[0];
      if (pick) { assertBacked(pick, {location: null, now: Date.parse(now), saves}); out.set(s.source.text, pick.reasons[0]); }
    }
    return {r, out};
  };
  const friday = run('2026-11-13T18:10:00-05:00').out;
  assert.equal(friday.get('DJ set at Spirits & Tales tonight'), 'Happening today');
  assert.equal(friday.get('Pop-up closes Sunday'), 'Last weekend before it closes');
  assert.equal(friday.get('Market on Saturday'), 'On Saturday 14 Nov');
  assert.equal(friday.get('Show next Thursday'), 'On Thursday 19 Nov');
  const late = run('2026-11-14T02:30:00-05:00');
  assert.equal(late.out.get('DJ set at Spirits & Tales tonight'), 'Happening tonight', 'the Friday session is still open at 2:30 am');
  assert.equal(late.out.get('Market on Saturday'), 'On Saturday 14 Nov', 'not "today" before the user has slept');
  assert.ok(!late.r.explain.notes.some(n => /passed/.test(n)));
  const morning = run('2026-11-14T11:00:00-05:00');
  assert.equal(morning.out.get('DJ set at Spirits & Tales tonight'), undefined, 'passed after the 5 am reset');
  assert.equal(morning.out.get('Market on Saturday'), 'Happening today');
  assert.ok(morning.r.explain.notes.some(n => /1 save has passed/.test(n)));
  const monday = run('2026-11-16T18:00:00-05:00').out;
  assert.equal(monday.get('Closes Tuesday'), 'Ends tomorrow');
  // Saved Thursday evening: "yesterday" on Friday, never "today".
  const age = decideTonight({saves: [saves[0]], context: {now: '2026-11-13T18:10:00-05:00'}, seed: 0}).picks[0].reasons;
  assert.ok(age.includes('Saved yesterday'), age.join(' / '));
});

test('at 2:30 am, 11 am and with no location the picks still carry a real reason each, in both cities', () => {
  const nights = ['2026-11-13T18:10:00-05:00', '2026-11-14T02:30:00-05:00', '2026-11-15T11:00:00-05:00'];
  for (const [label, data] of [['pittsburgh', pack], ['columbus', columbus]]) {
    for (const now of nights) {
      const from = Date.parse(now);
      const events = label === 'pittsburgh' ? tonightEvents(from, from + 86400000) : [];
      for (const location of [null, {lat: data.center.lat, lng: data.center.lng}]) {
        const r = decideTonight({places: data.places, events, context: {now, location}, seed: 0});
        assert.equal(r.picks.length, 3, `${label} ${now}`);
        for (const pick of r.picks) assertBacked(pick, {location, now: from});
      }
    }
  }
});
