import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cityFromPack, enrichPlaces, placeStates, placeForOuting} from '../src/city/cityPlaces.js';
import {kindLabel, placeLine, ageText, distanceText, count} from '../src/city/placeText.js';
import {kindIcon, ICONS} from '../src/ui/icons.js';
import {boardProgress} from '../src/cityBoard.js';
import {pageFromHash} from '../src/app/routes.js';
import {CITY_PACKS} from '../src/city/packs.js';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const pack = read('../data/city-packs/pittsburgh.json');
const guide = read('../src/data/pittsburgh-editorial.json').places;
const city = cityFromPack(pack, Date.parse('2026-11-12T12:00:00Z'));
const stamp = '2026-11-01T12:00:00.000Z';
const outing = (id, status, place, extra = {}) => ({id, status, place, planDate: '', visitDate: status === 'visited' ? '2026-11-01' : '', notes: '', with: '', rating: 0, photos: [], createdAt: stamp, updatedAt: stamp, ...extra});

test('the map set and the board total are the same number', () => {
  assert.equal(city.places.length, city.board.total);
  assert.ok(city.board.total > 1500 && city.board.total <= pack.places.length);
  assert.equal(new Set(city.places.map(p => p.id)).size, city.places.length);
});

test('guide notes attach to pack places without adding places', () => {
  const enriched = enrichPlaces(city.places, guide);
  assert.equal(enriched.length, city.places.length);
  const noted = enriched.filter(p => p.recommendation);
  assert.ok(noted.length >= 20, `${noted.length} notes`);
  for (const p of enriched.filter(p => p.photo)) assert.ok(p.photo.license, 'only licensed photos');
  assert.ok(enriched.every(p => !p.websitePhoto));
  assert.ok(enriched.every(p => !p.mapPhoto), 'map photos come only from the photo index');
});

test('place states agree with the board: done wins, saves and plans by id or same venue', () => {
  const [a, b, c] = city.places;
  const moved = {...b, id: 'old-guide-id', lat: b.lat + 0.0001};
  const outings = [
    outing('s1', 'saved', a, {source: {url: '', app: 'note', text: 'x', savedAt: stamp, eventDate: '', expiresAt: ''}}),
    outing('p1', 'planned', moved),
    outing('v1', 'visited', c), outing('s2', 'saved', c),
    outing('s3', 'saved', null, {source: {url: '', app: 'note', text: 'ramen', savedAt: stamp, eventDate: '', expiresAt: ''}}),
  ];
  const states = placeStates(city.places, outings);
  assert.equal(states.get(a.id), 'saved');
  assert.equal(states.get(b.id), 'planned');
  assert.equal(states.get(c.id), 'done');
  assert.equal([...states.values()].filter(s => s === 'done').length, boardProgress(city.board, outings).done);
  assert.equal(placeForOuting(outings[4], city.places, new Map()), null);
});

test('place text is short and factual', () => {
  assert.equal(kindLabel('coffee_shop'), 'Coffee shop');
  assert.equal(kindLabel('ice_cream'), 'Ice cream');
  assert.equal(kindLabel(''), '');
  assert.equal(placeLine({category: 'bar', neighborhood: 'Polish Hill'}), 'Bar in Polish Hill');
  assert.equal(placeLine({category: 'bar', neighborhood: 'Elsewhere'}), 'Bar');
  const now = new Date(2026, 10, 12, 20);
  assert.equal(ageText(new Date(2026, 10, 12, 1).toISOString(), now), 'today');
  assert.equal(ageText(new Date(2026, 10, 11, 23).toISOString(), now), 'yesterday');
  assert.equal(ageText(new Date(2026, 10, 2).toISOString(), now), '10 days ago');
  assert.equal(ageText(new Date(2026, 9, 22).toISOString(), now), '3 weeks ago');
  assert.equal(ageText('nope', now), '');
  assert.equal(distanceText(0.55), '550 m');
  assert.equal(distanceText(1.24), '1.2 km');
  assert.equal(distanceText(14.4), '14 km');
  assert.equal(count(1622), '1,622');
});

test('every kind in every pack has a drawn icon', () => {
  for (const file of ['pittsburgh', 'pittsburgh-metro', 'columbus']) {
    for (const kind of Object.keys(read(`../data/city-packs/${file}.json`).counts.byKind)) {
      const name = kindIcon(kind);
      assert.ok(ICONS[name], `${kind} -> ${name}`);
      assert.notEqual(name, 'place', `${kind} falls back to the generic pin`);
    }
  }
  for (const nav of ['map', 'pile', 'board', 'journal', 'add', 'check', 'directions', 'shuffle', 'clock', 'link', 'close', 'back', 'settings']) assert.ok(ICONS[nav], nav);
});

test('routes land old links on the new tabs and the switcher lists every pack', () => {
  assert.equal(pageFromHash(''), 'map');
  assert.equal(pageFromHash('#find'), 'map');
  assert.equal(pageFromHash('#plans'), 'journal');
  assert.equal(pageFromHash('#memories'), 'journal');
  assert.equal(pageFromHash('#board'), 'board');
  assert.equal(pageFromHash('#settings'), 'settings');
  assert.deepEqual(CITY_PACKS.map(p => p.id), ['pittsburgh', 'pittsburgh-metro', 'columbus']);
});

test('each city pack lists its own centre, so the map can fly there before the places load', () => {
  for (const meta of CITY_PACKS) {
    const data = read(`../data/city-packs/${meta.id}.json`);
    assert.deepEqual(meta.center, data.center, meta.id);
  }
});
