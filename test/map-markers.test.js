import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {markerTone, markerTier, markerRanks, placeFeatures, badgeName, parseBadgeName, photoName, parsePhotoName, photoCell, districtFeatures} from '../src/map/markers.js';
import {ICONS} from '../src/ui/icons.js';

const place = (id, category = 'restaurant', extra = {}) => ({id, name: id, lat: 40.44, lng: -80, category, ...extra});

test('tone: gold for done, blue for saved and planned, neutral otherwise', () => {
  assert.equal(markerTone('done'), 'done');
  assert.equal(markerTone('saved'), 'saved');
  assert.equal(markerTone('planned'), 'saved');
  assert.equal(markerTone(undefined), 'none');
});

test('done beats saved and planned, which beat photos, which beat guide notes, which beat the rest', () => {
  const photo = {mapPhoto: {index: 7}};
  const places = [place('rest'), place('noted', 'restaurant', {recommendation: {text: 'Get the pierogies'}}), place('pictured', 'restaurant', photo),
    place('saved'), place('planned'), place('done'), place('done-photo', 'restaurant', photo)];
  const states = new Map([['saved', 'saved'], ['planned', 'planned'], ['done', 'done'], ['done-photo', 'done']]);
  const ranks = markerRanks(places, states);
  const order = [...places].sort((a, b) => ranks.get(a.id) - ranks.get(b.id)).map(p => p.id);
  assert.deepEqual(order.slice(0, 2).sort(), ['done', 'done-photo'], 'a photo never lifts a place above done');
  assert.deepEqual(order.slice(2, 4).sort(), ['planned', 'saved']);
  assert.deepEqual(order.slice(4), ['pictured', 'noted', 'rest']);
  assert.equal(markerTier(place('x'), undefined), 4);
  assert.equal(markerTier(place('x', 'bar', {recommendation: {text: ''}}), undefined), 4, 'an empty note is not a note');
  assert.equal(markerTier(place('x', 'bar', {mapPhoto: {index: -1}}), undefined), 4, 'no atlas cell is no photo');
  assert.equal(markerTier(place('x', 'bar', {mapPhoto: {index: 0}}), 'saved'), 1);
});

test('features carry the atlas cell of a photo, or -1', () => {
  const {features} = placeFeatures([place('a', 'cafe', {mapPhoto: {index: 0}}), place('b'), place('c', 'bar', {mapPhoto: {}})]);
  assert.deepEqual(features.map(f => f.properties.photo), [0, -1, -1]);
  assert.equal(photoCell({mapPhoto: {index: 12}}), 12);
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
  assert.deepEqual(parsePhotoName(photoName(12, 'saved')), {cell: 12, tone: 'saved', selected: false});
  assert.deepEqual(parsePhotoName(photoName(0, 'none', true)), {cell: 0, tone: 'none', selected: true});
  for (const bad of ['photo:-1:none', 'photo:x:none', 'photo:3:red', 'badge:coffee:done', 'photo:3']) assert.equal(parsePhotoName(bad), null, bad);
  assert.equal(parseBadgeName(photoName(3, 'done')), null, 'a photo name is not a badge name');
});

test('district names: one per neighbourhood with enough places, at its median, biggest first', () => {
  const at = (id, hood, lat, lng) => ({id, name: id, lat, lng, category: 'bar', neighborhood: hood});
  const places = [
    ...Array.from({length: 9}, (_, i) => at(`s${i}`, 'South Side Flats', 40.428 + i * 0.0001, -79.98)),
    at('far', 'South Side Flats', 41.5, -79.98),
    ...Array.from({length: 8}, (_, i) => at(`o${i}`, 'Oakland', 40.44, -79.95)),
    ...Array.from({length: 3}, (_, i) => at(`t${i}`, 'Tiny', 40.45, -79.9)),
    ...Array.from({length: 12}, (_, i) => at(`e${i}`, 'Elsewhere', 40.4, -80)),
    at('none', '', 40.4, -80),
  ];
  const {features} = districtFeatures(places);
  assert.deepEqual(features.map(f => f.properties.name), ['South Side Flats', 'Oakland']);
  const [lng, lat] = features[0].geometry.coordinates;
  assert.equal(lng, -79.98);
  assert.ok(lat < 40.43, 'an outlier does not drag the label');
  assert.equal(features[0].properties.band, 12, 'the biggest district shows first');
  // Two big districts a few metres apart: the smaller one waits for a closer zoom.
  const close = districtFeatures([...Array.from({length: 9}, (_, i) => at(`a${i}`, 'A', 40.44, -80)), ...Array.from({length: 8}, (_, i) => at(`b${i}`, 'B', 40.443, -80))]).features;
  assert.deepEqual(close.map(f => [f.properties.name, f.properties.band]), [['A', 12], ['B', 15]]);
  const pack = JSON.parse(readFileSync(new URL('../data/city-packs/pittsburgh.json', import.meta.url), 'utf8'));
  const real = districtFeatures(pack.places).features.map(f => f.properties.name);
  assert.ok(real.length >= 20 && real.includes('Strip District'), `${real.length} districts`);
});
