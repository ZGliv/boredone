import test from 'node:test';
import assert from 'node:assert/strict';
import { shortlistPlaces } from '../src/shortlist.js';
const place = (id, distanceKm, category = 'Cafe') => ({ id, distanceKm, category });
test('distance and mood bound a shortlist without claiming unknown distances fit', () => {
  const places = [place('near', .4), place('far', 2), place('unknown', null), place('park', .2, 'Park')];
  assert.deepEqual(shortlistPlaces(places, [], 'food', '30').map(x => x.place.id), ['near']);
  assert.equal(shortlistPlaces(places, [], 'food', 'any').length, 3);
  assert.deepEqual(shortlistPlaces(places, [], 'culture'), []);
});
test('plans first, then unvisited, then memories; nearest breaks ties; cap and deduplicate', () => {
  const places = [place('seen', .1), place('new', .3), place('plan', .8), place('other', .2), place('plan', .8)];
  const outings = [{status:'visited', place:places[0]}, {status:'planned', place:places[2]}];
  const before = structuredClone({places, outings});
  const result = shortlistPlaces(places, outings);
  assert.deepEqual(result.map(x => x.place.id), ['plan', 'other', 'new']);
  assert.match(result[0].reason, /Already in your plans/);
  assert.deepEqual({places, outings}, before);
});
test('empty results and only memories remain honest and usable', () => {
  assert.deepEqual(shortlistPlaces([], []), []);
  const p = place('seen', .1);
  assert.match(shortlistPlaces([p], [{status:'visited', place:p}])[0].reason, /Revisit a memory/);
});
