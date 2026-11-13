import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {cityFromPack, enrichPlaces} from '../src/city/cityPlaces.js';
import {guidePhoto, photoIndex, photoCredit} from '../src/city/placePhotos.js';
import {buildPlacePhotos} from '../scripts/build-place-photos.mjs';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const index = read('../src/data/place-photos.json');
const previews = read('../src/data/photo-previews.json');
const guide = read('../src/data/pittsburgh-editorial.json').places;
const pittsburgh = cityFromPack(read('../data/city-packs/pittsburgh.json'), Date.parse('2026-11-12T12:00:00Z')).places;
const enriched = enrichPlaces(pittsburgh, guide, index);
const withPhoto = enriched.filter(p => p.mapPhoto);

const previewsFixture = {atlas: '/a.webp', columns: 2, rows: 2, photos: {'/guide-photos/x.jpg': {card: '/photo-previews/x.webp', index: 0}, 'https://site.test/y.jpg': {card: '/photo-previews/y.webp', index: 1}}};
const licensed = {url: '/guide-photos/x.jpg', license: 'CC0', author: 'A', sourceUrl: 'https://commons.wikimedia.org/wiki/File:X.jpg'};
const website = {url: 'https://site.test/y.jpg', sourceUrl: 'https://www.site.test/menu', author: 'Site', kind: 'website-preview', scope: 'venue', license: null};

test('the committed photo index is what the guide and previews produce now', () => {
  assert.deepEqual(index, buildPlacePhotos(), 'run node scripts/build-place-photos.mjs');
});

test('a guide record shows its licensed photo first, its website photo otherwise, never a blocked or unbundled one', () => {
  assert.equal(guidePhoto({photo: licensed, websitePhoto: website}, previewsFixture).kind, 'licensed');
  assert.equal(guidePhoto({websitePhoto: website}, previewsFixture).kind, 'website');
  assert.equal(guidePhoto({websitePhoto: website, websiteBlocked: true}, previewsFixture), null);
  assert.equal(guidePhoto({photo: {...licensed, license: null}}, previewsFixture), null, 'an unlicensed guide photo is not a licensed one');
  assert.equal(guidePhoto({websitePhoto: {...website, url: 'https://elsewhere.test/z.jpg'}}, previewsFixture), null);
  const built = photoIndex([{id: 'a', name: 'A', lat: 1, lng: 2, websitePhoto: website}, {id: 'a', name: 'A', lat: 1, lng: 2, photo: licensed}], previewsFixture);
  assert.equal(built.places.length, 1, 'one record per guide id');
  assert.deepEqual(built.places[0].photo, {kind: 'website', index: 1, card: '/photo-previews/y.webp', credit: website});
});

test('every Pittsburgh place the guide pairs with gets a pin photo, licensed and website, with its original credit', () => {
  assert.equal(enriched.length, pittsburgh.length, 'no places added');
  const kinds = withPhoto.reduce((n, p) => ({...n, [p.mapPhoto.kind]: (n[p.mapPhoto.kind] || 0) + 1}), {});
  assert.ok(withPhoto.length >= 250, `${withPhoto.length} photo pins`);
  assert.ok(kinds.licensed >= 5 && kinds.website >= 200, JSON.stringify(kinds));
  const cells = previews.columns * previews.rows;
  for (const {mapPhoto: m} of withPhoto) {
    assert.equal(m.atlas, previews.atlas);
    assert.ok(Number.isInteger(m.index) && m.index >= 0 && m.index < cells);
    assert.match(m.card, /^\/photo-previews\/[0-9a-f]{20}\.webp$/);
    assert.ok(existsSync(new URL(`../public${m.card}`, import.meta.url)), m.card);
    assert.equal(previews.photos[m.credit.originalUrl || m.credit.url].index, m.index, 'cell belongs to this photo');
    if (m.kind === 'licensed') assert.ok(m.credit.license && m.credit.author && m.credit.sourceUrl);
    else assert.ok(m.credit.sourceUrl.startsWith('https://') && m.credit.kind === 'website-preview');
  }
  // place.photo stays licensed-only for the rest of the app.
  for (const p of enriched.filter(p => p.photo)) assert.ok(p.photo.license);
});

test('pairing is by id, then by the same venue nearby; one photo per place; a far-off record pairs with nothing', () => {
  const [a, b] = pittsburgh;
  const photo = (index, kind = 'website') => ({kind, index, card: `/photo-previews/${String(index).padStart(20, '0')}.webp`, credit: {}});
  const fixture = {atlas: '/atlas.webp', columns: 16, rows: 34, places: [
    {id: a.id, name: 'Different name', lat: 0, lng: 0, photo: photo(1)},
    {id: 'guide-b', name: b.name, lat: b.lat + 0.0002, lng: b.lng, photo: photo(2)},
    {id: 'guide-b2', name: b.name, lat: b.lat, lng: b.lng, photo: photo(3, 'licensed')},
    {id: 'far', name: b.name, lat: b.lat + 1, lng: b.lng, photo: photo(4)},
  ]};
  const out = enrichPlaces([a, b], [], fixture);
  assert.equal(out[0].mapPhoto.index, 1);
  assert.equal(out[1].mapPhoto.index, 3, 'a licensed photo claims the venue first');
  assert.equal(out[1].mapPhoto.atlas, '/atlas.webp');
  assert.deepEqual(enrichPlaces([a, b], []), [a, b], 'no index, no change');
});

test('Columbus has no photos and loses nothing', () => {
  const columbus = cityFromPack(read('../data/city-packs/columbus.json')).places;
  assert.ok(enrichPlaces(columbus, guide, index).every(p => !p.mapPhoto));
});

test('credit lines: author and licence for Commons, the site for website photos', () => {
  assert.deepEqual(photoCredit({kind: 'licensed', credit: {...licensed, licenseUrl: 'https://cc.test/'}}), {text: 'A', href: licensed.sourceUrl, licence: 'CC0', licenceHref: 'https://cc.test/'});
  assert.deepEqual(photoCredit({kind: 'website', credit: website}), {text: 'site.test', href: 'https://www.site.test/menu', licence: '', licenceHref: ''});
  assert.equal(photoCredit({kind: 'website', credit: {...website, scope: 'brand'}}).text, 'site.test (brand photo)');
  assert.equal(photoCredit({kind: 'website', credit: {author: 'Shop'}}).text, 'Shop');
  assert.equal(photoCredit({kind: 'website', credit: {sourceUrl: 'https://media.thecapitalgrille.com/x'}}).text, 'thecapitalgrille.com');
  assert.equal(photoCredit({kind: 'website', credit: {sourceUrl: 'https://shop.example.co.uk/'}}).text, 'example.co.uk');
  assert.equal(photoCredit(null), null);
});
