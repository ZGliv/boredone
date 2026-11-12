// Build Boredone city packs from Overture Maps open data.
//
//   node scripts/city-pack/build.mjs                 # every city in cities.json
//   node scripts/city-pack/build.mjs columbus        # one city
//   node scripts/city-pack/build.mjs --reuse ...     # reuse the cached raw download
//
// To add a city, append to cities.json:
//   {"slug": "erie", "name": "Erie, PA", "center": {"lat": 42.1292, "lng": -80.0851}, "radiusKm": 5}
//
// Needs uv (https://docs.astral.sh/uv/) for the DuckDB fetch step. No keys.
// Raw downloads are cached outside the repo (BOREDONE_CITY_PACK_CACHE or the
// system temp dir); packs are written to data/city-packs/<slug>.json.
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bboxFor, buildPack} from './mapping.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const config = JSON.parse(readFileSync(join(here, 'cities.json'), 'utf8'));
const args = process.argv.slice(2);
const reuse = args.includes('--reuse');
const wanted = args.filter(a => !a.startsWith('--'));
const cacheDir = process.env.BOREDONE_CITY_PACK_CACHE || join(tmpdir(), 'boredone-city-packs');
const outDir = join(repo, 'data/city-packs');
mkdirSync(cacheDir, {recursive: true});
mkdirSync(outDir, {recursive: true});

function resolveCity(city) {
 if (!city.guide) return city;
 // Same area as the bundled guide: its centre and radius (metres).
 const guide = JSON.parse(readFileSync(join(repo, city.guide), 'utf8'));
 return {...city, center: {lat: guide.center.lat, lng: guide.center.lng}, radiusKm: guide.radius / 1000};
}

export function serializePack(pack) {
 const {places, ...header} = pack;
 const head = JSON.stringify(header, null, 2).replace(/\n}$/, '');
 return `${head},\n  "places": [\n${places.map(p => `    ${JSON.stringify(p)}`).join(',\n')}\n  ]\n}\n`;
}

function fetchRaw(city, release, rawPath) {
 const box = bboxFor(city.center, city.radiusKm);
 const py = ['run', '--with', 'duckdb', 'python', '-I', join(here, 'fetch_overture.py'),
  '--release', release, '--west', String(box.west), '--south', String(box.south),
  '--east', String(box.east), '--north', String(box.north), '--out', rawPath];
 const run = spawnSync(process.env.UV || 'uv', py, {stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8'});
 if (run.status !== 0) throw new Error(`Overture fetch failed for ${city.slug} (exit ${run.status}).`);
 return run.stdout.trim();
}

const selected = config.cities.filter(c => !wanted.length || wanted.includes(c.slug));
if (!selected.length) throw new Error(`No city matches ${wanted.join(', ')}.`);
for (const entry of selected) {
 const city = resolveCity(entry);
 const release = entry.release || config.release;
 const rawPath = join(cacheDir, `${city.slug}-${release}.raw.json`);
 const started = Date.now();
 const fetched = !(reuse && existsSync(rawPath));
 if (fetched) console.log(`${city.slug}: fetch ${fetchRaw(city, release, rawPath)}`);
 const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
 const pack = buildPack(raw, city);
 // wallSeconds covers fetch + mapping in this run; null when the raw file was reused.
 pack.build = {...raw.fetch, rawBytes: statSync(rawPath).size, wallSeconds: fetched ? Math.round((Date.now() - started) / 100) / 10 : null};
 const outPath = join(outDir, `${city.slug}.json`);
 writeFileSync(outPath, serializePack(pack));
 console.log(`${city.slug}: ${pack.counts.total} places, ${pack.counts.duplicatesMerged} merged, ${JSON.stringify(pack.counts.rejected)} -> ${outPath} (${statSync(outPath).size} bytes)`);
}
