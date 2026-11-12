// Pure mapping from raw Overture Maps place rows to Boredone places.
// No I/O here so it can be tested with node --test.
import {VENUE_KINDS} from '../../src/venues.js';

// Overture taxonomy.primary -> Boredone kind (see src/venues.js).
// Only categories that are a place you go out to, and that land on an
// existing kind without stretching its meaning.
export const PRIMARY_TO_KIND = {
 // food
 restaurant:'restaurant',diner:'restaurant',bistro:'restaurant',tapas_bar:'restaurant',
 sandwich_shop:'restaurant',delicatessen:'restaurant',bagel_shop:'restaurant',
 bakery:'bakery',donut_shop:'bakery',cupcake_shop:'bakery',pretzel_shop:'bakery',patisserie:'bakery',
 ice_cream_shop:'ice_cream',frozen_yogurt_shop:'ice_cream',gelato_shop:'ice_cream',shaved_ice_shop:'ice_cream',
 // drinks
 bar:'bar',dive_bar:'bar',cocktail_bar:'bar',sports_bar:'bar',hookah_bar:'bar',wine_bar:'bar',gay_bar:'bar',
 beer_bar:'bar',speakeasy:'bar',tiki_bar:'bar',cigar_bar:'bar',piano_bar:'bar',lounge:'bar',
 pub:'pub',irish_pub:'pub',gastropub:'pub',
 beer_garden:'biergarten',
 brewery:'brewery',cidery:'brewery',
 winery:'winery',wine_tasting_room:'winery',
 dance_club:'nightclub',nightlife_venue:'nightclub',
 // coffee
 cafe:'cafe',tea_room:'cafe',bubble_tea_shop:'cafe',
 coffee_shop:'coffee_shop',coffee_roastery:'coffee_shop',
 // culture
 movie_theater:'cinema',drive_in_theater:'cinema',
 theatre_venue:'theatre',performing_arts_venue:'theatre',opera_and_ballet:'theatre',
 music_venue:'music_venue',jazz_and_blues_venue:'music_venue',karaoke_venue:'music_venue',
 comedy_club:'comedy_club',
 // play
 arcade:'amusement_arcade',escape_room:'escape_game',bowling_alley:'bowling_alley',
 miniature_golf_course:'miniature_golf',bike_rental:'bicycle_rental',dance_studio:'dance_studio',
 horseback_riding_service:'horseback_riding',ice_skating_rink:'ice_rink',trampoline_park:'trampoline_park',
 glass_blowing_venue:'art_studio',axe_throwing:'axe_throwing',
};
// Any *_restaurant leaf (thai_restaurant, steakhouse is listed below) is a restaurant,
// except fast food, which the existing guide also leaves out.
const RESTAURANT_EXTRA = new Set(['steakhouse','soul_food','pancake_house','salad_bar','cafeteria','acai_bowls','poke_restaurant']);
const NOT_RESTAURANT = new Set(['fast_food_restaurant']);

export function kindFor(row) {
 const primary = String(row?.taxonomy_primary || '');
 if (!primary) return null;
 if (PRIMARY_TO_KIND[primary]) return PRIMARY_TO_KIND[primary];
 // Overture files several real stages (O'Reilly Theater, New Hazlett Theater)
 // under theatrical_production, alongside touring companies with no venue.
 // Only the ones named as a building count.
 if (primary === 'theatrical_production' && /\b(theat(er|re)|playhouse)\b/i.test(row.name || '')) return 'theatre';
 if (NOT_RESTAURANT.has(primary) || row.basic_category === 'fast_food_restaurant') return null;
 if (primary.endsWith('_restaurant') || RESTAURANT_EXTRA.has(primary)) {
  const h = row.taxonomy_hierarchy || [];
  if (h[0] === 'food_and_drink') return 'restaurant';
 }
 return null;
}

export const CLOSED_STATUSES = new Set(['permanently_closed','temporarily_closed']);

// Chosen by reading every confidence band of Pittsburgh venue rows in the
// 2026-10-21.0 release. Below 0.5 the rows are mostly one-off events and
// promoters filed as venues ("Four Chord Music Festival", "DJ Juan Diego Inc",
// "Pittsburgh Restaurant Week"), with a few real venues lost. From 0.5 up they
// are mostly real venues (The Attic, Moto, Bitter Ends Luncheonette).
export const MIN_CONFIDENCE = 0.5;

// Business-registry rows sometimes carry the legal entity instead of the
// trading name ("Funhouse Theaters Inc" is Mr. Smalls). Showing those would be
// wrong, so they are dropped rather than renamed.
const LEGAL_ENTITY = /\b(inc|llc|l\.l\.c|llp|corp|corporation|ltd)\.?$/i;
export const isLegalEntityName = name => LEGAL_ENTITY.test(String(name || '').trim());

// Overture almost never files chains under fast_food_restaurant: McDonald's is
// a burger_restaurant, Subway a sandwich_shop. So fast food is also caught by
// brand. Coffee chains (Starbucks, Dunkin') are deliberately not on this list.
const FAST_FOOD = /^(mcdonalds|burger king|wendys|taco bell|kfc|kentucky fried chicken|subway|popeyes|arbys|jimmy johns|dominos|papa johns|pizza hut|little caesars|chick fil a|sonic drive in|dairy queen|hardees|carls jr|jack in the box|white castle|long john silvers|checkers|rallys|wingstop|charleys (philly|cheesesteaks)|jersey mikes|firehouse subs|panda express|del taco|culvers|whataburger|raising canes)\b/;
export const isFastFoodChain = row => [row?.name, row?.brand].some(n => FAST_FOOD.test(normalizeName(n)));

// One-off events and prizes that Overture files as venues ("Deutschtown Music
// Festival", "Gene Kelly Awards ...") are not places you can go to; nor is a
// weekly night ("2Step Tuesdays - UK Garage").
const EVENT_NAME = /\b(festival|awards?|mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays)\b/i;

// A street address filed as a name ("1700 Penn Ave") names no venue.
const ADDRESS_NAME = /^\d+[a-z]?\s+(?:[nsew]\.?\s+)?[a-z]+(?:\s+[a-z]+)?\s+(st|street|ave|avenue|rd|road|blvd|boulevard|way|dr|drive|ln|lane|pl|place|pike|hwy|highway)\.?$/i;
export const isAddressName = name => ADDRESS_NAME.test(String(name || '').trim());

// Business-registry names as people read them. "2 Benjamin S Llc Mario S
// Pizza" is the registry's row for Mario's Pizza: the trading name follows
// the legal entity (and a "D B A"), and the registry writes "'s" as " S".
// "Thomas & Fisk, Ltd. Coffee Roasters" only loses the ", Ltd.". A trailing
// full stop goes unless it closes an abbreviation ("Co.", "Bros."); a few
// acronyms get their capitals back. Returns "" when no trading name is left.
const LEGAL_MID = /^(.*?)(,?)\s*\b(?:llc|l\.l\.c\.?|inc|corp|corporation|ltd)\b\.?\s*(.*)$/i;
// "Dba" (doing business as), as registries spell it, typos included ("Dbs").
const DBA = /(?:^|\s|\.)(?:d\s?\.?b\s?\.?[as]|d\/b\/a)\b\.?\s+(.+)$/i;
const ACRONYMS = {amc: 'AMC', bbq: 'BBQ', pnc: 'PNC', upmc: 'UPMC', ymca: 'YMCA', ywca: 'YWCA', vfw: 'VFW', pgh: 'PGH'};
// A final full stop that closes an abbreviation stays: "Co.", "Bros.", "Etc.", "U.S.A.", "P.A.".
const ABBREVIATIONS = /(\b(co|bros|st|jr|sr|inc|ltd|mt|ave|etc)|(^|[\s.])[a-z])\.$/i;
export function cleanName(name) {
 let text = String(name || '').trim().replace(/\s+/g, ' ');
 let registry = false;
 const dba = DBA.exec(text);
 if (dba) { text = dba[1].trim(); registry = true; }
 const legal = LEGAL_MID.exec(text);
 if (legal) {
  const [, before, comma, after] = legal;
  const rest = after.replace(/^[\s,.-]+/, '');
  if (comma && rest) text = `${before} ${rest}`.trim();
  else if (rest) {
   // "Ttg Inc Of Columbus": what follows the entity is not a name either.
   if (/^(of|at|in|the end)\b/i.test(rest)) return '';
   text = rest; registry = true;
  }
  else text = before.trim();
 }
 if (registry) text = text.replace(/\b([A-Za-z]{2,}) S\b(?=\s|$)/g, "$1's");
 if (/\.$/.test(text) && !ABBREVIATIONS.test(text)) text = text.slice(0, -1).trim();
 text = text.replace(/\b[A-Za-z]+\b/g, w => ACRONYMS[w.toLowerCase()] && w === w[0].toUpperCase() + w.slice(1).toLowerCase() ? ACRONYMS[w.toLowerCase()] : w);
 return text;
}
export const isEventName = name => EVENT_NAME.test(String(name || '')) && !/\btgi fridays\b/i.test(String(name || ''));

export function normalizeName(name) {
 return String(name || '')
  .normalize('NFKD').replace(/[̀-ͯ]/g,'')
  .toLowerCase()
  .replace(/[’'`]/g,'')
  .replace(/&/g,' and ')
  .replace(/[^a-z0-9]+/g,' ')
  .replace(/^the /,'')
  .trim();
}

export function distanceKm(a, b) {
 const R = 6371.0088, toRad = d => d * Math.PI / 180;
 const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
 const s = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
 return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bboxFor(center, radiusKm) {
 const dLat = radiusKm / 111.32;
 const dLng = radiusKm / (111.32 * Math.cos(center.lat * Math.PI / 180));
 const r = n => Math.round(n * 1e5) / 1e5;
 return {west:r(center.lng - dLng), south:r(center.lat - dLat), east:r(center.lng + dLng), north:r(center.lat + dLat)};
}

const httpUrl = value => {
 try { const u = new URL(String(value)); return ['http:','https:'].includes(u.protocol) ? u.href : ''; }
 catch { return ''; }
};

export function addressFor(row) {
 const a = (row.addresses || [])[0];
 if (!a) return '';
 const tail = [a.locality, [a.region, a.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
 return [a.freeform, tail].filter(Boolean).join(', ').slice(0, 600);
}

function recordSources(row) {
 return (row.record_sources || []).filter(s => s && s.dataset);
}

export function licenceFor(row) {
 const list = [...new Set(recordSources(row).map(s => s.license).filter(Boolean))];
 return list.length ? list.join(', ') : 'CDLA-Permissive-2.0';
}

// Why a row is or is not in the pack. Returns null when kept.
export function rejectReason(row, center, radiusKm, minConfidence = MIN_CONFIDENCE) {
 if (!row || !String(row.name || '').trim()) return 'no_name';
 if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng)) return 'no_location';
 if (distanceKm(center, row) > radiusKm) return 'outside_radius';
 if (!kindFor(row)) return 'not_going_out';
 const name = cleanName(row.name);
 if (!name) return 'legal_entity_name';
 if (isFastFoodChain(row) || isFastFoodChain({name})) return 'fast_food_chain';
 if (isEventName(name)) return 'event_not_venue';
 if (isAddressName(name)) return 'address_not_venue';
 if (CLOSED_STATUSES.has(row.operating_status)) return 'closed';
 if (!Number.isFinite(row.confidence) || row.confidence < minConfidence) return 'low_confidence';
 if (isLegalEntityName(row.name)) return 'legal_entity_name';
 return null;
}

export function toPlace(row, center, release) {
 const datasets = [...new Set(recordSources(row).map(s => s.dataset))];
 const place = {
  id: `overture-${row.id}`,
  name: cleanName(row.name).slice(0, 180),
  lat: Math.round(row.lat * 1e7) / 1e7,
  lng: Math.round(row.lng * 1e7) / 1e7,
  category: kindFor(row),
  address: addressFor(row),
  website: (row.websites || []).map(httpUrl).find(Boolean) || '',
  source: `Overture Maps ${release}${datasets.length ? ` (${datasets.join(', ')})` : ''}`.slice(0, 100),
  sourceUrl: `https://explore.overturemaps.org/#17/${row.lat.toFixed(6)}/${row.lng.toFixed(6)}`,
  hours: '',
  fee: '',
  access: '',
  distanceKm: Math.round(distanceKm(center, row) * 10) / 10,
  licence: licenceFor(row),
 };
 if (row.neighborhood) place.neighborhood = String(row.neighborhood);
 return place;
}

const SPELLING = {theatre:'theater',centre:'center',company:'co',brothers:'bros'};
const GENERIC = new Set(['the','and','restaurant','cafe','bar','grill','pub','coffee','house','co','lounge','kitchen','pittsburgh','pgh','shop','eatery','tavern']);
const words = name => normalizeName(name).split(' ').filter(Boolean).map(w => SPELLING[w] || w);
// Spaces removed, so "Mc Ardle's" = "Mcardle's" and "Cafe 412" = "Cafe412".
const compact = name => words(name).join('');
const core = name => words(name).filter(w => !GENERIC.has(w)).join('');
// Kind words are left out only when judging typos, never for exact core
// equality, where they keep "Steel City Pizza" apart from "Steel City Coffee".
const KIND_WORDS = new Set(['nightclub','night','club','theater','pizza','pizzeria','bistro','diner','grille','saloon','brewery','brewing','bakery','steakhouse']);
const typoCore = name => words(name).filter(w => !GENERIC.has(w) && !KIND_WORDS.has(w)).join('');

function editDistanceAtMost(a, b, max) {
 if (Math.abs(a.length - b.length) > max) return false;
 let prev = Array.from({length: b.length + 1}, (_, i) => i);
 for (let i = 1; i <= a.length; i++) {
  const cur = [i];
  for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  if (Math.min(...cur) > max) return false;
  prev = cur;
 }
 return prev[b.length] <= max;
}

// Same venue name? Equal after normalising spelling and spacing ("Greer
// Cabaret Theatre" / "Theater"), equal once generic words are dropped
// ("Leon's Caribbean Restaurant" / "Leon's Caribbean"), one a prefix of the
// other ("Primanti Bros" / "Primanti Bros Strip District"), a one- or
// two-letter typo in a long name ("Parilla" / "Parrilla"), or mostly the same words.
export function sameName(a, b) {
 const x = compact(a), y = compact(b);
 if (!x || !y) return false;
 if (x === y) return true;
 const cx = core(a), cy = core(b);
 if (cx.length >= 4 && cx === cy) return true;
 const [short, long] = x.length <= y.length ? [x, y] : [y, x];
 if (short.length >= 6 && long.startsWith(short)) return true;
 // The typo must also be small within the distinctive words, or "Cake
 // Nightclub" and "Cavo Night Club" look like one venue.
 const tx0 = typoCore(a), ty0 = typoCore(b);
 if (short.length >= 10 && editDistanceAtMost(x, y, 2) &&
  editDistanceAtMost(tx0, ty0, Math.max(1, Math.floor(Math.min(tx0.length, ty0.length) / 5)))) return true;
 const tx = new Set(words(a).filter(t => t.length > 1)), ty = new Set(words(b).filter(t => t.length > 1));
 const shared = [...tx].filter(t => ty.has(t) && !GENERIC.has(t)).length;
 return shared >= 2 && shared / Math.max(1, Math.min(tx.size, ty.size)) >= 0.75;
}

// Collapse rows that are the same venue listed twice: the same name (see
// sameName) within mergeKm. The most confident row wins; ties go to the one
// with a website.
export function mergeDuplicates(rows, mergeKm = 0.06) {
 const ranked = [...rows].sort((a, b) =>
  (b.confidence ?? 0) - (a.confidence ?? 0) ||
  Number(!!(b.websites?.length)) - Number(!!(a.websites?.length)) ||
  String(a.id).localeCompare(String(b.id)));
 // ~110 m grid cells; a twin can only be in the same or a neighbouring cell.
 const cell = 0.001, grid = new Map();
 const key = (i, j) => `${i}:${j}`;
 const kept = [], merged = [];
 for (const row of ranked) {
  const i = Math.floor(row.lat / cell), j = Math.floor(row.lng / cell);
  let twin = null;
  for (let di = -1; di <= 1 && !twin; di++) for (let dj = -1; dj <= 1 && !twin; dj++)
   twin = (grid.get(key(i + di, j + dj)) || []).find(p => distanceKm(p, row) <= mergeKm && sameName(p.name, row.name)) || null;
  if (twin) { merged.push({kept: twin, dropped: row}); continue; }
  const k = key(i, j);
  grid.set(k, [...(grid.get(k) || []), row]);
  kept.push(row);
 }
 return {kept, merged};
}

const countBy = (items, key) => {
 const out = {};
 for (const item of items) { const k = key(item); out[k] = (out[k] || 0) + 1; }
 return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
};

export const LICENCE_NOTICES = {
 'CDLA-Permissive-2.0': 'Overture Maps Foundation places data, CDLA-Permissive-2.0 (https://cdla.dev/permissive-2-0/).',
 'Apache-2.0': 'Includes Foursquare Open Source Places via Overture, Apache-2.0. © Foursquare Labs, Inc. (https://www.apache.org/licenses/LICENSE-2.0).',
 'CC0-1.0': 'Includes CC0-1.0 records (e.g. AllThePlaces) via Overture.',
 ODbL: 'Neighborhood boundaries from Overture divisions, derived from OpenStreetMap: © OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright).',
};

// For rows outside every neighbourhood boundary: the nearest point-only
// neighbourhood label within maxKm, else nothing. Returns a new row.
export const NEAREST_HOOD_KM = 0.8;
export function withNearestNeighborhood(row, points, maxKm = NEAREST_HOOD_KM) {
 if (row.neighborhood || !points?.length) return row;
 let best = null, bestKm = maxKm;
 for (const p of points) {
  const km = distanceKm(row, p);
  if (km <= bestKm) { best = p; bestKm = km; }
 }
 return best ? {...row, neighborhood: best.name, neighborhood_type: 'nearest_point'} : row;
}

export function buildPack(raw, city, builtAt = new Date().toISOString()) {
 const {center, radiusKm} = city;
 const rejected = {};
 const excludedCategories = {};
 const eligible = [];
 for (const row of raw.places || []) {
  const reason = rejectReason(row, center, radiusKm, city.minConfidence ?? MIN_CONFIDENCE);
  if (reason) {
   rejected[reason] = (rejected[reason] || 0) + 1;
   if (reason === 'not_going_out' && distanceKm(center, row) <= radiusKm) {
    const k = row.taxonomy_primary || 'uncategorised';
    excludedCategories[k] = (excludedCategories[k] || 0) + 1;
   }
   continue;
  }
  eligible.push(row);
 }
 const {kept, merged} = mergeDuplicates(eligible);
 const located = kept.map(row => withNearestNeighborhood(row, raw.neighborhoodPoints));
 const neighborhoodMethod = countBy(located, row => row.neighborhood ? (row.neighborhood_type === 'nearest_point' ? 'nearest_point_within_800m' : 'inside_boundary') : 'none');
 const places = located.map(row => toPlace(row, center, raw.release))
  .filter(p => VENUE_KINDS.has(p.category))
  .sort((a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name));
 const licences = [...new Set(places.flatMap(p => p.licence.split(', ')))].sort();
 const notices = licences.map(l => LICENCE_NOTICES[l] || `Records under ${l} via Overture Maps.`);
 if (places.some(p => p.neighborhood)) notices.push(LICENCE_NOTICES.ODbL);
 return {
  city: city.name,
  // What board labels use: "Columbus bars", not "Columbus, OH bars".
  shortName: city.shortName || city.name,
  slug: city.slug,
  center,
  radiusKm,
  builtAt,
  release: raw.release,
  source: 'Overture Maps Foundation places theme',
  minConfidence: city.minConfidence ?? MIN_CONFIDENCE,
  counts: {
   total: places.length,
   byKind: countBy(places, p => p.category),
   byNeighborhood: countBy(places, p => p.neighborhood || '(none)'),
   neighborhoodMethod,
   rawRows: (raw.places || []).length,
   rejected,
   duplicatesMerged: merged.length,
   topExcludedCategories: Object.fromEntries(Object.entries(excludedCategories).sort((a, b) => b[1] - a[1]).slice(0, 40)),
  },
  licences: notices,
  notice: 'Open map data, not live venue information. Opening hours, prices and photos are not supplied.',
  places,
 };
}
