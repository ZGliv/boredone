import { VENUE_KINDS } from '../src/venues.js';
import { diversePool } from './place-pool.js';
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { distanceKm, searchInput } from "./discovery.js";

// Explicit user-requested offline neighborhood downloads, not a live venue API.
// https://openfreemap.org/tos/: <=4 requests, <=50 MB and <=3,000 tiles per area.
export const AREA_LIMITS = { tiles: 64, bytes: 25 * 1024 * 1024, parallel: 4 };
const TILEJSON = "https://tiles.openfreemap.org/planet/latest";
const UA = "Bordone/0.3 (user-requested offline neighborhood guide)";
const ZOOM = 14;
const N = 2 ** ZOOM;
const categoryKinds = {
  outdoors: new Set(["park", "garden", "nature_reserve", "viewpoint"]),
  culture: new Set(["museum", "gallery", "art_gallery", "arts_centre", "theatre", "cinema", "attraction"]),
  food: new Set(["cafe", "restaurant", "ice_cream", "bar", "pub", "biergarten", "nightclub", "bakery"]),
  play: new Set(["bowling_alley", "miniature_golf", "escape_game", "sports_centre"]),
};
const cancelled = () => new DOMException("Area download cancelled.", "AbortError");

export function areaTiles({ lat, lng, radius }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180 || ![1500, 3000, 5000].includes(radius)) throw new Error("Choose a valid area and radius.");
  const angular = radius / 6371000;
  const dy = angular * 180 / Math.PI;
  const dx = Math.asin(Math.min(1, Math.sin(angular) / Math.cos(lat * Math.PI / 180))) * 180 / Math.PI;
  const tileY = (value) => Math.min(N - 1, Math.max(0, Math.floor((1 - Math.asinh(Math.tan(Math.max(-85.0511, Math.min(85.0511, value)) * Math.PI / 180)) / Math.PI) / 2 * N)));
  const left = Math.floor((lng - dx + 180) / 360 * N), right = Math.floor((lng + dx + 180) / 360 * N);
  const top = tileY(lat + dy), bottom = tileY(lat - dy);
  if ((right - left + 1) * (bottom - top + 1) > AREA_LIMITS.tiles) throw new Error("This area is too large to save. Choose a smaller radius.");
  const result = [];
  for (let x = left; x <= right; x++) for (let y = top; y <= bottom; y++) result.push({ z: ZOOM, x: ((x % N) + N) % N, y });
  return result;
}

export function decodePlaces(bytes, { x, y, z }) {
  const layer = new VectorTile(new PbfReader(bytes)).layers.poi;
  const features = [];
  for (let i = 0; i < (layer?.length ?? 0); i++) {
    const feature = layer.feature(i), properties = feature.properties;
    const name = properties.name || properties["name:en"] || properties.name_en;
    if (!name) continue;
    const geometry = feature.toGeoJSON(x, y, z).geometry;
    if (geometry.type !== "Point") continue;
    const [lng, lat] = geometry.coordinates;
    features.push({ id: feature.id, name: String(name), kind: String(properties.subclass || properties.class || ""), class: String(properties.class || ""), lat, lng });
  }
  return features;
}

export function selectAreaPlaces(features, input, limit = 120) {
  const seen = new Map(), kinds = input.category === "all" ? VENUE_KINDS : categoryKinds[input.category];
  return diversePool(features.flatMap((item) => {
    if (!kinds?.has(item.kind)) return [];
    if (!item.name || !Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return [];
    const distance = distanceKm(input, item);
    if (distance > input.radius / 1000) return [];
    // Tile buffers and separate building/entrance nodes can repeat one venue.
    const key = item.name.trim().toLowerCase(), nearby = seen.get(key) ?? [];
    if (nearby.some((prior) => distanceKm(prior, item) < 0.075)) return [];
    nearby.push(item); seen.set(key, nearby);
    return [{ id: `ofm-${item.id ?? "place"}-${item.lat.toFixed(5)}-${item.lng.toFixed(5)}`, name: item.name.slice(0, 180), lat: item.lat, lng: item.lng,
      category: item.kind.replaceAll("_", " "), address: "", website: "", source: "OpenMapTiles / OpenStreetMap",
      sourceUrl: `https://www.openstreetmap.org/?mlat=${item.lat}&mlon=${item.lng}#map=18/${item.lat}/${item.lng}`,
      hours: "", fee: "", access: "", distanceKm: Math.round(distance * 10) / 10, distance }];
  }).sort((a, b) => a.distance - b.distance), limit).map(({ distance: _distance, ...place }) => place);
}

export function createOfflineAreaService({ fetcher = (...args) => fetch(...args), decode = decodePlaces, clock = Date.now, placeLimit = 120 } = {}) {
  let running = 0, jobs = 0, metadata = null;
  const waiters = [], tileCache = new Map();
  async function acquire(signal) {
    if (signal.aborted) throw cancelled();
    if (running < AREA_LIMITS.parallel) { running++; return; }
    await new Promise((resolve, reject) => {
      const waiter = { resolve: () => { signal.removeEventListener("abort", onAbort); resolve(); } };
      const onAbort = () => { const index = waiters.indexOf(waiter); if (index >= 0) waiters.splice(index, 1); reject(cancelled()); };
      waiters.push(waiter); signal.addEventListener("abort", onAbort, { once: true });
    });
  }
  function release() { const next = waiters.shift(); if (next) next.resolve(); else running--; }
  async function read(url, signal, budget) {
    await acquire(signal);
    try {
      if (signal.aborted) throw cancelled();
      const response = await fetcher(url, { signal, headers: { "User-Agent": UA } });
      if (!response.ok) throw new Error("The area download is unavailable. Please try again later.");
      const chunks = []; let size = 0;
      const reader = response.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.byteLength; budget.bytes += value.byteLength;
          if (budget.bytes > AREA_LIMITS.bytes) throw new Error("This area exceeds the offline download limit. Choose a smaller radius.");
          chunks.push(value);
        }
      } catch (error) { await reader.cancel().catch(() => {}); throw error; }
      const output = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
      return output;
    } finally { release(); }
  }
  return async function download(input, { signal } = {}) {
    const tiles = areaTiles(input);
    if (jobs >= 2) throw new Error("Another area download is in progress. Please try again shortly.");
    let timedOut = false;
    const controller = new AbortController(), deadline = setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) controller.abort();
    jobs++; const budget = { bytes: 0 };
    try {
      if (!metadata || clock() - metadata.at > 3600000) {
        const body = JSON.parse(new TextDecoder().decode(await read(TILEJSON, controller.signal, budget)));
        const template = body.tiles?.[0];
        if (typeof template !== "string" || !/^https:\/\/tiles\.openfreemap\.org\/planet\/[\w-]+\/\{z\}\/\{x\}\/\{y\}\.pbf$/.test(template)) throw new Error("The map download format changed. Please try again later.");
        metadata = { at: clock(), template, version: template.split("/")[4] };
      }
      const current = metadata, parts = new Array(tiles.length); let next = 0;
      const workers = Array.from({ length: Math.min(4, tiles.length) }, async () => {
        for (;;) {
          const index = next++; if (index >= tiles.length) return;
          if (controller.signal.aborted) throw cancelled();
          const tile = tiles[index], url = current.template.replace("{z}", tile.z).replace("{x}", tile.x).replace("{y}", tile.y);
          const cached = tileCache.get(url);
          if (cached && clock() - cached.at < 86400000) { parts[index] = cached.places; continue; }
          const places = decode(await read(url, controller.signal, budget), tile);
          parts[index] = places;
          tileCache.set(url, { at: clock(), places });
          while (tileCache.size > 96) tileCache.delete(tileCache.keys().next().value);
        }
      });
      try { await Promise.all(workers); }
      catch (error) { controller.abort(); await Promise.allSettled(workers); throw error; }
      if (controller.signal.aborted) throw cancelled();
      const date = /^(\d{4})(\d{2})(\d{2})/.exec(current.version);
      return { center: { lat: input.lat, lng: input.lng }, radius: input.radius, category: input.category, places: selectAreaPlaces(parts.flat(), input, placeLimit),
        fetchedAt: new Date(clock()).toISOString(), sourceUpdatedAt: date ? `${date[1]}-${date[2]}-${date[3]}T00:00:00.000Z` : null,
        providerName: "OpenFreeMap area download", providerUrl: "https://openfreemap.org/", datasetVersion: current.version,
        offlineArea: true, cached: false, stale: false, tileCount: tiles.length, downloadedBytes: budget.bytes,
        notice: "Downloaded map places for offline use. This is a map dataset, not live venue information; hours and access are not supplied.",
        attribution: "OpenFreeMap · © OpenMapTiles · OpenStreetMap contributors" };
    } catch (error) {
      if (signal?.aborted) throw cancelled();
      if (timedOut) throw new Error("The area download timed out. Your previously saved places are still available.");
      throw error;
    } finally { clearTimeout(deadline); signal?.removeEventListener("abort", onAbort); jobs--; }
  };
}

const downloadArea = createOfflineAreaService();
export async function offlineAreaHandler(req, res) {
  if (req.method !== "GET") { res.statusCode = 405; res.end(); return; }
  let input;
  try { input = searchInput(new URL(req.url, "http://localhost").searchParams); }
  catch (error) { res.statusCode = 400; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: error.message })); return; }
  const controller = new AbortController();
  const onClose = () => { if (!res.writableEnded) controller.abort(); };
  res.on("close", onClose);
  try {
    const result = await downloadArea(input, { signal: controller.signal });
    if (!controller.signal.aborted) { res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(result)); }
  } catch (error) {
    if (!controller.signal.aborted) { res.statusCode = 503; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify({ error: error.message })); }
  } finally { res.off("close", onClose); }
}
