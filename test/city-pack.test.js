import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {validatePlace} from '../src/model.js';
import {VENUE_KINDS} from '../src/venues.js';
import {kindFor, rejectReason, normalizeName, sameName, mergeDuplicates, withNearestNeighborhood, buildPack, bboxFor, toPlace, isLegalEntityName, isFastFoodChain, isEventName} from '../scripts/city-pack/mapping.mjs';
import {compareGuide} from '../scripts/city-pack/compare.mjs';

const center = {lat: 40.44, lng: -80};
const row = (over = {}) => ({
 id: '08f2a100d2a4c2c103d1b1b1b1b1b1b1', name: 'Grim Wizard Coffee', lat: 40.4401, lng: -80.0002,
 confidence: 0.95, operating_status: 'open', basic_category: 'coffee_shop',
 taxonomy_primary: 'coffee_shop', taxonomy_hierarchy: ['food_and_drink', 'beverage_shop', 'coffee_shop'],
 websites: ['https://grimwizard.example/'], addresses: [{freeform: '1 Main St', locality: 'Pittsburgh', region: 'PA', postcode: '15222'}],
 record_sources: [{dataset: 'meta', license: 'CDLA-Permissive-2.0', record_id: '1'}], neighborhood: 'Strip District',
 ...over,
});

test('Overture taxonomy maps onto existing going-out kinds only', () => {
 assert.equal(kindFor(row()), 'coffee_shop');
 assert.equal(kindFor(row({taxonomy_primary: 'thai_restaurant', taxonomy_hierarchy: ['food_and_drink', 'restaurant', 'thai_restaurant']})), 'restaurant');
 assert.equal(kindFor(row({taxonomy_primary: 'irish_pub'})), 'pub');
 assert.equal(kindFor(row({taxonomy_primary: 'dance_club'})), 'nightclub');
 assert.equal(kindFor(row({taxonomy_primary: 'movie_theater'})), 'cinema');
 assert.equal(kindFor(row({taxonomy_primary: 'escape_room'})), 'escape_game');
 assert.equal(kindFor(row({name: 'New Hazlett Theater', taxonomy_primary: 'theatrical_production'})), 'theatre');
 assert.equal(kindFor(row({name: 'Touring Players', taxonomy_primary: 'theatrical_production'})), null);
 for (const primary of ['fast_food_restaurant', 'museum', 'art_gallery', 'park', 'gym', 'caterer', 'distillery', 'stadium_arena', null])
  assert.equal(kindFor(row({taxonomy_primary: primary, basic_category: primary})), null, String(primary));
 for (const kind of Object.values(probeKinds())) assert.ok(VENUE_KINDS.has(kind), kind);
});
function probeKinds() {
 const probe = ['restaurant', 'bakery', 'ice_cream_shop', 'bar', 'pub', 'beer_garden', 'brewery', 'winery', 'cafe', 'coffee_shop', 'movie_theater', 'theatre_venue', 'music_venue', 'comedy_club', 'arcade', 'bowling_alley', 'miniature_golf_course', 'bike_rental', 'dance_studio', 'horseback_riding_service', 'ice_skating_rink', 'trampoline_park', 'glass_blowing_venue', 'axe_throwing'];
 return Object.fromEntries(probe.map(p => [p, kindFor(row({taxonomy_primary: p}))]));
}

test('closed, low-confidence, legal-entity and out-of-area rows are rejected with a reason', () => {
 assert.equal(rejectReason(row(), center, 5), null);
 assert.equal(rejectReason(row({operating_status: 'permanently_closed'}), center, 5), 'closed');
 assert.equal(rejectReason(row({operating_status: 'temporarily_closed'}), center, 5), 'closed');
 assert.equal(rejectReason(row({confidence: 0.3}), center, 5), 'low_confidence');
 assert.equal(rejectReason(row({confidence: null}), center, 5), 'low_confidence');
 assert.equal(rejectReason(row({lat: 40.6}), center, 5), 'outside_radius');
 assert.equal(rejectReason(row({name: 'Funhouse Theaters Inc'}), center, 5), 'legal_entity_name');
 assert.equal(rejectReason(row({name: '  '}), center, 5), 'no_name');
 assert.ok(isLegalEntityName('Ssb-pgh, Llc'));
 assert.equal(isLegalEntityName('Urban Trail Coffee Co.'), false);
});

test('a mapped place matches the shared place contract and keeps GERS id, source and licence', () => {
 const place = toPlace(row(), center, '2026-10-21.0');
 assert.equal(place.id, 'overture-08f2a100d2a4c2c103d1b1b1b1b1b1b1');
 assert.equal(place.category, 'coffee_shop');
 assert.equal(place.address, '1 Main St, Pittsburgh, PA 15222');
 assert.equal(place.source, 'Overture Maps 2026-10-21.0 (meta)');
 assert.equal(place.licence, 'CDLA-Permissive-2.0');
 assert.equal(place.neighborhood, 'Strip District');
 assert.deepEqual([place.hours, place.fee, place.access], ['', '', '']);
 assert.ok(place.distanceKm >= 0 && place.distanceKm < 0.1);
 assert.doesNotThrow(() => validatePlace(place));
 assert.equal(toPlace(row({websites: ['ftp://x.example/']}), center, 'r').website, '');
});

test('names compare across spelling, spacing and suffix differences without merging different venues', () => {
 assert.equal(normalizeName('The Café & Bar'), 'cafe and bar');
 assert.ok(sameName('Greer Cabaret Theatre', 'Greer Cabaret Theater'));
 assert.ok(sameName('Cafe412', 'Cafe 412'));
 assert.ok(sameName('Primanti Brothers', 'Primanti Bros.'));
 assert.ok(sameName('Gaucho Parilla Argentina', 'Gaucho Parrilla Argentina'));
 assert.equal(sameName('Starbucks', 'Subway'), false);
 assert.equal(sameName('Bar 301', 'Bar Louie'), false);
});

test('duplicates within 60 m merge to the most confident row; same name farther apart stays', () => {
 const a = row({id: 'a', name: 'Cavo Nightclub', confidence: 0.8});
 const b = row({id: 'b', name: 'Cavo Night Club', confidence: 0.99, lat: 40.4402});
 const far = row({id: 'c', name: 'Cavo Nightclub', lat: 40.45});
 const {kept, merged} = mergeDuplicates([a, b, far]);
 assert.deepEqual(kept.map(r => r.id).sort(), ['b', 'c']);
 assert.equal(merged.length, 1);
});

test('rows outside every boundary take the nearest point-only neighbourhood within 800 m', () => {
 const points = [{name: 'Downtown', lat: 40.441, lng: -80.0}, {name: 'Far', lat: 40.5, lng: -80}];
 assert.equal(withNearestNeighborhood(row({neighborhood: null}), points).neighborhood, 'Downtown');
 assert.equal(withNearestNeighborhood(row({neighborhood: 'Strip District'}), points).neighborhood, 'Strip District');
 assert.equal(withNearestNeighborhood(row({neighborhood: null, lat: 40.47}), points).neighborhood, null);
});

test('buildPack writes a header with counts, licences and only venue kinds', () => {
 const raw = {release: '2026-10-21.0', neighborhoodPoints: [], places: [
  row(), row({id: 'x', name: 'Law Office', taxonomy_primary: 'attorney_or_law_firm'}),
  row({id: 'y', name: 'Old Bar', taxonomy_primary: 'bar', operating_status: 'permanently_closed'}),
  row({id: 'z', name: 'Foursquare Pub', taxonomy_primary: 'pub', lat: 40.445, record_sources: [{dataset: 'Foursquare', license: 'Apache-2.0'}], neighborhood: null}),
 ]};
 const pack = buildPack(raw, {name: 'Pittsburgh', slug: 'pittsburgh', center, radiusKm: 5}, '2026-11-11T00:00:00.000Z');
 assert.equal(pack.counts.total, 2);
 assert.deepEqual(pack.counts.byKind, {coffee_shop: 1, pub: 1});
 assert.deepEqual(pack.counts.byNeighborhood, {'(none)': 1, 'Strip District': 1});
 assert.deepEqual(pack.counts.rejected, {not_going_out: 1, closed: 1});
 assert.ok(pack.licences.some(l => l.includes('Apache-2.0')) && pack.licences.some(l => l.includes('ODbL')));
 assert.equal(pack.release, '2026-10-21.0');
});

test('fast-food chains are rejected even when Overture files them under an ordinary restaurant kind', () => {
 // Real Pittsburgh rows: McDonald's is a burger_restaurant, Subway a sandwich_shop.
 const burger = {taxonomy_primary: 'burger_restaurant', taxonomy_hierarchy: ['food_and_drink', 'restaurant', 'meat_restaurant', 'burger_restaurant'], basic_category: 'restaurant'};
 assert.equal(rejectReason(row({name: "McDonald's", ...burger}), center, 5), 'fast_food_chain');
 assert.equal(rejectReason(row({name: 'Burger King Restaurants', ...burger}), center, 5), 'fast_food_chain');
 assert.equal(rejectReason(row({name: 'SUBWAY', taxonomy_primary: 'sandwich_shop', basic_category: 'casual_eatery'}), center, 5), 'fast_food_chain');
 assert.equal(rejectReason(row({name: 'Pizza on Penn', brand: "Domino's", taxonomy_primary: 'pizza_restaurant', taxonomy_hierarchy: ['food_and_drink', 'restaurant', 'pizza_restaurant']}), center, 5), 'fast_food_chain');
 // Local places that merely share a word stay; coffee chains are a separate decision and stay.
 assert.equal(rejectReason(row({name: 'Burgatory', ...burger}), center, 5), null);
 assert.equal(rejectReason(row({name: 'Starbucks'}), center, 5), null);
});

test('events and prizes filed as venues are rejected', () => {
 assert.equal(rejectReason(row({name: 'Deutschtown Music Festival', taxonomy_primary: 'music_venue'}), center, 5), 'event_not_venue');
 assert.equal(rejectReason(row({name: 'Gene Kelly Awards for Excellence in High School Musical Theater', taxonomy_primary: 'theatre_venue'}), center, 5), 'event_not_venue');
 assert.equal(rejectReason(row({name: 'Stage AE', taxonomy_primary: 'music_venue'}), center, 5), null);
 assert.equal(rejectReason(row({name: 'Regatta Bar & Grill', taxonomy_primary: 'bar'}), center, 5), null);
 assert.equal(rejectReason(row({name: "Charley's Place", taxonomy_primary: 'bar'}), center, 5), null);
});

test('a two-letter typo inside the distinctive word is a different venue, not a duplicate', () => {
 // Found in the Pittsburgh comparison: both are guide nightclubs.
 assert.equal(sameName('Cake Nightclub', 'Cavo Night Club'), false);
 const {kept} = mergeDuplicates([row({id: 'a', name: 'Cake Nightclub'}), row({id: 'b', name: 'Cavo Night Club', lat: 40.4402})]);
 assert.equal(kept.length, 2);
 // Real typos still match.
 assert.ok(sameName('Bangal Kebab House & Restaurant', 'Bengal Kabab House & Restaurant'));
 assert.ok(sameName('Asian Tea House', 'Asia Tea House'));
 assert.ok(sameName("Wilson's BBq", "Wilson's Bar-B-Q"));
 assert.ok(sameName('Layal cafe & restaurant', 'Layali Cafe & Restaurant'));
});

test('committed city packs contain no fast-food chains or event names', () => {
 const dir = new URL('../data/city-packs/', import.meta.url);
 for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const pack = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
  const bad = pack.places.filter(p => isFastFoodChain(p) || isEventName(p.name)).map(p => p.name);
  assert.deepEqual(bad, [], file);
 }
});

test('bounding box covers the radius', () => {
 const box = bboxFor(center, 5);
 assert.ok(box.north - center.lat > 0.044 && center.lat - box.south > 0.044);
 assert.ok(box.east - center.lng > 0.058);
});

test('guide comparison separates matched, old-only (with reason) and new-only places', () => {
 const guide = [{name: 'Cavo Nightclub', lat: 40.44, lng: -80}, {name: 'Yo Rita', lat: 40.43, lng: -79.98}, {name: 'Ghost Diner', lat: 40.42, lng: -79.99}];
 const pack = [toPlace(row({id: 'p1', name: 'Cavo Night Club', lat: 40.4401, lng: -80}), center, 'r'), toPlace(row({id: 'p2', name: 'New Spot'}), center, 'r')];
 const raw = [row({id: 'r1', name: 'Yo Rita', lat: 40.4301, lng: -79.98, taxonomy_primary: 'mexican_restaurant', taxonomy_hierarchy: ['food_and_drink', 'restaurant'], operating_status: 'permanently_closed'})];
 const r = compareGuide(guide, pack, raw, {center, radiusKm: 5});
 assert.equal(r.matched.length, 1);
 assert.deepEqual(r.onlyOld.map(x => x.why), ['closed', 'no_overture_record_nearby']);
 assert.deepEqual(r.onlyNew.map(p => p.name), ['New Spot']);
 assert.equal(r.closedInOverture.length, 1);
});

test('committed city packs hold only valid venue places with unique ids', () => {
 const dir = new URL('../data/city-packs/', import.meta.url);
 const files = readdirSync(dir).filter(f => f.endsWith('.json'));
 assert.ok(files.length >= 3);
 for (const file of files) {
  const pack = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
  assert.equal(pack.counts.total, pack.places.length, file);
  assert.equal(new Set(pack.places.map(p => p.id)).size, pack.places.length, file);
  for (const p of pack.places) {
   assert.ok(VENUE_KINDS.has(p.category), `${file} ${p.name} ${p.category}`);
   assert.ok(p.id.startsWith('overture-'));
   validatePlace(p);
  }
 }
});
