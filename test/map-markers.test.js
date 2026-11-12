import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {markerTone, markerTier, markerRanks, placeFeatures, badgeName, parseBadgeName} from '../src/map/markers.js';
import {ICONS} from '../src/ui/icons.js';

const place = (id, category = 'restaurant', extra = {}) => ({id, name: id, lat: 40.44, lng: -80, category, ...extra});

test('tone: gold for done, blue for saved and planned, neutral otherwise', () => {
  assert.equal(markerTone('done'), 'done');
  assert.equal(markerTone('saved'), 'saved');
  assert.equal(markerTone('planned'), 'saved');
  assert.equal(markerTone(undefined), 'none');
});

test('done beats saved and planned, which beat guide notes, which beat the rest', () => {
  const places = [place('rest'), place('noted', 'restaurant', {recommendation: {text: 'Get the pierogies'}}), place('saved'), place('planned'), place('done')];
  const states = new Map([['saved', 'saved'], ['planned', 'planned'], ['done', 'done']]);
  const ranks = markerRanks(places, states);
  const order = [...places].sort((a, b) => ranks.get(a.id) - ranks.get(b.id)).map(p => p.id);
  assert.equal(order[0], 'done');
  assert.deepEqual(order.slice(1, 3).sort(), ['planned', 'saved']);
  assert.deepEqual(order.slice(3), ['noted', 'rest']);
  assert.equal(markerTier(place('x'), undefined), 3);
  assert.equal(markerTier(place('x', 'bar', {recommendation: {text: ''}}), undefined), 3, 'an empty note is not a note');
});

test('within a tier, rarer kinds rank ahead of common ones, and never cross into the next tier', () => {
  const places = [place('r1'), place('r2'), place('r3'), place('theatre', 'theatre'), place('done-r', 'restaurant')];
  const ranks = markerRanks(places, new Map([['done-r', 'done']]));
  assert.ok(ranks.get('theatre') < ranks.get('r1'));
  assert.equal(ranks.get('r1'), ranks.get('r2'));
  assert.ok(ranks.get('done-r') < 1);
  for (const r of ranks.values()) assert.ok(r - Math.floor(r) < 1);
});

test('features carry what the symbol layers read, for a whole real pack', () => {
  const pack = JSON.parse(readFileSync(new URL('../data/city-packs/pittsburgh.json', import.meta.url), 'utf8'));
  const {features} = placeFeatures(pack.places, new Map([[pack.places[0].id, 'done']]));
  assert.equal(features.length, pack.places.length);
  assert.deepEqual(features[0].geometry.coordinates, [pack.places[0].lng, pack.places[0].lat]);
  assert.equal(features[0].properties.tone, 'done');
  for (const {properties} of features) {
    assert.ok(ICONS[properties.icon], `no icon ${properties.icon}`);
    assert.ok(Number.isFinite(properties.rank));
    assert.ok(properties.name);
  }
});

test('badge image names round-trip and reject anything else', () => {
  assert.deepEqual(parseBadgeName(badgeName('coffee', 'done')), {icon: 'coffee', tone: 'done', selected: false});
  assert.deepEqual(parseBadgeName(badgeName('film', 'none', true)), {icon: 'film', tone: 'none', selected: true});
  assert.equal(parseBadgeName('badge:coffee:red'), null);
  assert.equal(parseBadgeName('maki-cafe'), null);
});
