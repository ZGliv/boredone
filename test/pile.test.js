import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSave, attachPlace} from '../src/saves.js';
import {readInput, cleanLink, sourceName, fromLine, ageWords, shortAge, clockText, groupPile, reasonText, candidateQueue, captionDates, searchPlaces, requestResolve, tonightDate, kmFrom} from '../src/pile/pile.js';

const now = new Date('2026-11-12T23:00:00.000Z'); // Thursday evening in Pittsburgh
const at = iso => new Date(iso);
const place = (id, name, lat, lng, category = 'bar') => ({id, name, lat, lng, category, address: '', source: 'test'});
const lawrenceville = place('p1', 'Brillobox', 40.4652, -79.9586);
const polish = place('p2', 'Gooski\'s', 40.4569, -79.9666);
const downtown = place('p3', 'Siempre Algo', 40.4555, -80.0090, 'restaurant');

test('readInput separates a link from the words around it and drops share tracking', () => {
  assert.deepEqual(readInput('instagram.com/reel/C0ffee/?igsh=abc'), {url: 'https://instagram.com/reel/C0ffee/', text: ''});
  assert.deepEqual(readInput('Taco night at Brillobox this Friday! https://www.instagram.com/reel/C0ffee/?utm_source=ig_web_copy_link'),
    {url: 'https://www.instagram.com/reel/C0ffee/', text: 'Taco night at Brillobox this Friday!'});
  assert.deepEqual(readInput('  that ramen place Sam mentioned '), {url: '', text: 'that ramen place Sam mentioned'});
  assert.deepEqual(readInput(''), {url: '', text: ''});
  assert.equal(cleanLink('https://example.com/a?id=4&fbclid=x'), 'https://example.com/a?id=4');
  assert.equal(cleanLink('javascript:alert(1)'), '');
});

test('sourceName and fromLine say where a save came from in plain words', () => {
  const reel = makeSave({url: 'https://www.instagram.com/reel/C0ffee/', now: at('2026-11-12T22:59:30Z')});
  assert.equal(sourceName(reel), 'Instagram Reel');
  assert.equal(fromLine(reel, now), 'From an Instagram Reel, just now');
  assert.equal(fromLine(makeSave({url: 'https://vm.tiktok.com/ZMabc/', now: at('2026-11-10T18:00:00Z')}), now), 'From a TikTok, 2 days ago');
  assert.equal(fromLine(makeSave({url: 'https://maps.app.goo.gl/xyz', now}), now), 'From Google Maps, just now');
  assert.equal(fromLine(makeSave({url: 'https://www.eater.com/maps/best-pittsburgh', now}), now), 'From eater.com, just now');
  assert.equal(fromLine(makeSave({text: 'ramen', now: at('2026-11-10T18:00:00Z')}), now), 'Your note, 2 days ago');
  assert.equal(sourceName(makeSave({url: 'https://youtube.com/shorts/abcdefgh', now})), 'YouTube Short');
});

test('ages are whole local days, short at the end of a row', () => {
  assert.equal(ageWords('2026-11-12T15:00:00Z', now), 'today');
  assert.equal(ageWords('2026-10-20T15:00:00Z', now), '3 weeks ago');
  assert.equal(shortAge('2026-11-12T15:00:00Z', now), 'today');
  assert.equal(shortAge('2026-11-03T15:00:00Z', now), '9 d');
  assert.equal(shortAge('2026-10-20T15:00:00Z', now), '3 wk');
  assert.equal(shortAge('2026-06-01T15:00:00Z', now), '5 mo');
  assert.equal(shortAge('nonsense', now), '');
});

test('clockText names the day a save runs out', () => {
  const on = (eventDate, expiresAt = '') => ({status: 'saved', source: {eventDate, expiresAt}});
  assert.equal(clockText(on('2026-11-12'), '2026-11-12'), 'Today');
  assert.equal(clockText(on('2026-11-13'), '2026-11-12'), 'Tomorrow');
  assert.equal(clockText(on('2026-11-14'), '2026-11-12'), 'Saturday');
  assert.equal(clockText(on('', '2026-11-15'), '2026-11-12'), 'Ends Sunday');
  assert.equal(clockText(on('', '2026-11-12'), '2026-11-12'), 'Ends today');
  assert.equal(clockText(on('2026-11-14', '2026-11-14'), '2026-11-12'), 'Saturday', 'one day only');
  assert.equal(clockText(on('2026-12-02'), '2026-11-12'), 'Dec 2');
  assert.equal(clockText(on('2026-11-03'), '2026-11-12'), 'Ended Nov 3');
  assert.equal(clockText(on(''), '2026-11-12'), '');
});

test('groupPile: clocks first, then unplaced, then placed by distance, expired kept in Past', () => {
  const s = (opts, iso) => makeSave({...opts, now: at(iso)});
  const note = s({text: 'that ramen place'}, '2026-11-10T18:00:00Z');
  const newerNote = s({text: 'rooftop bar'}, '2026-11-11T18:00:00Z');
  const near = attachPlace(s({text: 'brillobox'}, '2026-10-01T18:00:00Z'), lawrenceville);
  const far = attachPlace(s({text: 'siempre'}, '2026-11-11T18:00:00Z'), downtown);
  const soon = s({text: 'pop-up', expiresAt: '2026-11-14'}, '2026-11-01T18:00:00Z');
  const gone = s({text: 'old show', eventDate: '2026-11-01'}, '2026-10-01T18:00:00Z');
  const planned = {...attachPlace(s({text: 'x'}, '2026-11-01T18:00:00Z'), polish), status: 'planned'};
  const all = [note, newerNote, near, far, soon, gone, planned];
  const me = {lat: 40.4650, lng: -79.9600};
  const g = groupPile(all, {today: '2026-11-12', near: me});
  assert.deepEqual(g.soon.map(x => x.id), [soon.id]);
  assert.deepEqual(g.unplaced.map(x => x.id), [newerNote.id, note.id]);
  assert.deepEqual(g.placed.map(x => x.id), [near.id, far.id]);
  assert.deepEqual(g.past.map(x => x.id), [gone.id]);
  assert.equal(g.byDistance, true);
  const unknown = groupPile(all, {today: '2026-11-12'});
  assert.deepEqual(unknown.placed.map(x => x.id), [far.id, near.id], 'newest first without a location');
  assert.equal(unknown.byDistance, false);
  assert.equal(kmFrom(null, lawrenceville), null);
});

test("reasonText keeps saveMatch's reason minus its search-centre distance", () => {
  assert.equal(reasonText('same name · 3.6 km away · same kind of place'), 'Same name, same kind of place');
  assert.equal(reasonText('similar name (88%) · one of 3 locations'), 'Similar name (88%), one of 3 locations');
  assert.equal(reasonText(''), '');
});

test('candidateQueue flattens matches best first, each place once, keeping its candidate', () => {
  const places = [lawrenceville, polish, downtown];
  const a = {name: 'Brillobox', venue: '', kind: 'bar', eventDate: '2026-11-13', expiresAt: '', evidence: 'Brillobox'};
  const b = {name: 'Brillobox', venue: '', kind: 'event', eventDate: '', expiresAt: '', evidence: 'Brillobox'};
  const c = {name: 'Siempre Algo', venue: '', kind: 'restaurant', eventDate: '', expiresAt: '', evidence: 'Siempre Algo'};
  const queue = candidateQueue([a, b, c], places, {lat: 40.4406, lng: -79.9959});
  assert.deepEqual(queue.map(q => q.place.id), ['p1', 'p3']);
  assert.equal(queue[0].candidate, a);
  assert.match(queue[0].reason, /^same name/);
  assert.deepEqual(candidateQueue([{name: 'Nowhere Diner', kind: 'restaurant', evidence: 'Nowhere Diner'}], places), []);
  const save = makeSave({text: 'x', now});
  assert.deepEqual(captionDates(save, a), {eventDate: '2026-11-13', expiresAt: ''});
  assert.equal(captionDates(save, c), null);
  assert.equal(captionDates(makeSave({text: 'x', eventDate: '2026-11-20', now}), a), null, 'a date the user set wins');
});

test('searchPlaces matches word starts, best names first', () => {
  const places = [lawrenceville, polish, downtown, place('p4', 'Brillo Pad Laundromat', 40.47, -79.95, 'laundry'), place('p5', 'Algo Bar', 40.4, -80, 'bar')];
  assert.deepEqual(searchPlaces(places, 'brill').map(p => p.id), ['p1', 'p4']);
  assert.deepEqual(searchPlaces(places, 'algo').map(p => p.id), ['p5', 'p3']);
  assert.deepEqual(searchPlaces(places, 'goos').map(p => p.id), ['p2']);
  assert.deepEqual(searchPlaces(places, 'b'), []);
  assert.deepEqual(searchPlaces(places, 'siempre algo').map(p => p.id), ['p3']);
  const brew = [place('b1', 'Church Street Brewery', 40.44, -79.99), place('b2', 'The Church Brew Works', 40.46, -79.97)];
  assert.deepEqual(searchPlaces(brew, 'church brew').map(p => p.id), ['b2', 'b1'], 'a leading "The" does not hide a prefix match');
});

test('requestResolve turns every resolver outcome into something the save survives', async () => {
  const reply = (status, body) => async () => ({ok: status < 400, status, json: async () => body});
  assert.deepEqual(await requestResolve({url: 'u'}, {fetchImpl: reply(200, {status: 'resolved', candidates: [{name: 'A'}]})}), {status: 'resolved', candidates: [{name: 'A'}]});
  assert.deepEqual(await requestResolve({url: 'u'}, {fetchImpl: reply(200, {status: 'needs-text', candidates: []})}), {status: 'needs-text', candidates: []});
  assert.deepEqual(await requestResolve({}, {fetchImpl: reply(429, {error: 'slow_down'})}), {status: 'error', reason: 'busy'});
  assert.deepEqual(await requestResolve({}, {fetchImpl: reply(503, {error: 'resolver_busy'})}), {status: 'error', reason: 'busy'});
  assert.deepEqual(await requestResolve({}, {fetchImpl: reply(502, {error: 'resolver_failed'})}), {status: 'error', reason: 'failed'});
  assert.deepEqual(await requestResolve({}, {fetchImpl: reply(200, '<html>')}), {status: 'error', reason: 'failed'});
  assert.deepEqual(await requestResolve({}, {fetchImpl: async () => { throw new TypeError('Failed to fetch'); }}), {status: 'error', reason: 'offline'});
  let called = false;
  assert.deepEqual(await requestResolve({}, {fetchImpl: async () => { called = true; }, online: false}), {status: 'error', reason: 'offline'});
  assert.equal(called, false);
  let sent;
  await requestResolve({url: 'u', text: 't', near: {lat: 1, lng: 2, city: 'Pittsburgh'}, today: '2026-11-12'}, {fetchImpl: async (_, init) => { sent = JSON.parse(init.body); return {ok: true, status: 200, json: async () => ({status: 'unresolved', candidates: []})}; }});
  assert.deepEqual(sent, {url: 'u', text: 't', today: '2026-11-12', near: {lat: 1, lng: 2, city: 'Pittsburgh'}});
});

test('tonightDate runs until 5 am', () => {
  assert.equal(tonightDate(new Date(2026, 10, 13, 2, 0)), '2026-11-12');
  assert.equal(tonightDate(new Date(2026, 10, 13, 6, 0)), '2026-11-13');
});
