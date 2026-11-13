import test from 'node:test';
import assert from 'node:assert/strict';
import {distanceKm, flightMs, tileAt, tilesBetween} from '../src/map/flight.js';

const pittsburgh = {lat: 40.44, lng: -80}, columbus = {lat: 39.9612, lng: -82.9988};

test('Pittsburgh to Columbus is a cinematic but short flight', () => {
  const km = distanceKm(pittsburgh, columbus);
  assert.ok(km > 240 && km < 270, `${km}`);
  const ms = flightMs(km);
  assert.ok(ms >= 3000 && ms <= 4000, `${ms}`);
  assert.equal(flightMs(distanceKm(pittsburgh, pittsburgh)), 1400);
  assert.equal(flightMs(5000), 3600, 'never slower than 3.6 s');
});

test('tiles are the standard web-mercator ones', () => {
  assert.deepEqual(tileAt({lat: 0, lng: 0}, 1), {z: 1, x: 1, y: 1});
  assert.deepEqual(tileAt(pittsburgh, 8), {z: 8, x: 71, y: 96});
});

test('a flight warms the box between the two cities at each zoom, and no more', () => {
  const tiles = tilesBetween(pittsburgh, columbus, [5, 6, 7, 8]);
  for (const z of [5, 6, 7, 8]) {
    const a = tileAt(pittsburgh, z), b = tileAt(columbus, z);
    const want = (Math.abs(a.x - b.x) + 1) * (Math.abs(a.y - b.y) + 1);
    assert.equal(tiles.filter(t => t.z === z).length, want, `z${z}`);
  }
  assert.ok(tiles.length < 30);
  assert.equal(tilesBetween(columbus, columbus, [13], 1).length, 9);
});
