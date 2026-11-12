// Compare a city pack with the existing hand-built guide.
//
//   node scripts/city-pack/compare.mjs data/city-packs/pittsburgh.json src/data/pittsburgh.json <raw.json>
//
// The raw file (written by build.mjs into its cache) is optional; with it the
// report also says why old-guide places are missing (closed, low confidence,
// a category we leave out) instead of only "not found".
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {distanceKm, rejectReason, sameName} from './mapping.mjs';

export function findMatch(place, candidates, maxKm = 0.15) {
 let best = null, bestKm = maxKm;
 for (const c of candidates) {
  if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
  const km = distanceKm(place, c);
  if (km <= bestKm && sameName(place.name, c.name)) { best = c; bestKm = km; }
 }
 return best;
}

export function compareGuide(guidePlaces, packPlaces, rawRows = [], area = null) {
 const matched = [], onlyOld = [], matchedPackIds = new Set();
 for (const old of guidePlaces) {
  const hit = findMatch(old, packPlaces);
  if (hit) { matched.push({old, pack: hit}); matchedPackIds.add(hit.id); continue; }
  const rawHit = rawRows.length ? findMatch(old, rawRows) : null;
  const why = !rawHit ? 'no_overture_record_nearby'
   : area ? rejectReason(rawHit, area.center, area.radiusKm, area.minConfidence) || 'merged_or_unknown'
   : 'excluded';
  onlyOld.push({old, raw: rawHit, why});
 }
 const onlyNew = packPlaces.filter(p => !matchedPackIds.has(p.id));
 const closedInOverture = guidePlaces
  .map(old => ({old, raw: rawRows.length ? findMatch(old, rawRows.filter(r => r.operating_status === 'permanently_closed')) : null}))
  .filter(x => x.raw);
 return {matched, onlyOld, onlyNew, closedInOverture};
}

function main([packPath, guidePath, rawPath]) {
 const pack = JSON.parse(readFileSync(packPath, 'utf8'));
 const guide = JSON.parse(readFileSync(guidePath, 'utf8'));
 const raw = rawPath ? JSON.parse(readFileSync(rawPath, 'utf8')) : {places: []};
 const r = compareGuide(guide.places, pack.places, raw.places, pack);
 const pick = (list, n = 15) => list.filter((_, i) => i % Math.max(1, Math.floor(list.length / n)) === 0).slice(0, n);
 const why = r.onlyOld.reduce((m, x) => (m[x.why] = (m[x.why] || 0) + 1, m), {});
 console.log(JSON.stringify({
  guide: guide.places.length,
  pack: pack.places.length,
  matched: r.matched.length,
  onlyInOldGuide: r.onlyOld.length,
  onlyInOldGuideWhy: why,
  onlyInNewPack: r.onlyNew.length,
  oldGuidePlacesOvertureMarksClosed: r.closedInOverture.length,
  examples: {
   matched: pick(r.matched).map(x => `${x.old.name} [${x.old.category}] = ${x.pack.name} [${x.pack.category}]`),
   onlyInOldGuide: pick(r.onlyOld).map(x => `${x.old.name} [${x.old.category}] -> ${x.why}${x.raw ? ` (Overture: ${x.raw.name}, ${x.raw.taxonomy_primary}, conf ${x.raw.confidence?.toFixed(2)}, ${x.raw.operating_status || 'status unknown'})` : ''}`),
   onlyInNewPack: pick(r.onlyNew).map(p => `${p.name} [${p.category}] ${p.neighborhood || ''} ${p.address}`),
   overtureMarksClosed: pick(r.closedInOverture).map(x => `${x.old.name} [${x.old.category}] (Overture: ${x.raw.name}, ${x.raw.taxonomy_primary})`),
  },
 }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
