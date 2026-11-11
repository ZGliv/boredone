import test from "node:test";
import assert from "node:assert/strict";
import { areaTiles, selectAreaPlaces, createOfflineAreaService, AREA_LIMITS } from "../server/offline-area.js";

const input = { lat: 40.44, lng: -80, radius: 1500, category: "all" };
const template = "https://tiles.openfreemap.org/planet/20261018_080001_pt/{z}/{x}/{y}.pbf";
const metadata = () => Response.json({ tiles: [template] });
const place = { id: 1, name: "Real mapped cafe", lat: 40.44, lng: -80, kind: "cafe", class: "cafe" };

test("bounded tile coverage crosses the date line and refuses excessive polar downloads", () => {
  const ordinary = areaTiles(input);
  assert.ok(ordinary.length > 1 && ordinary.length <= AREA_LIMITS.tiles);
  const wrapped = areaTiles({ ...input, lat: 0, lng: 180 });
  assert.ok(wrapped.some((tile) => tile.x === 0));
  assert.ok(wrapped.some((tile) => tile.x === 16383));
  assert.equal(new Set(wrapped.map((tile) => `${tile.x}:${tile.y}`)).size, wrapped.length);
  assert.throws(() => areaTiles({ ...input, lat: 84, radius: 5000 }), /smaller radius/);
});

test("offline places respect category/radius, dedupe tile buffers and leave unknown facts blank", () => {
  const selected = selectAreaPlaces([place, place, { ...place, id: 22, lat: place.lat + 0.0002 }, { ...place, id: 2, name: "Far away", lat: 42 }, { ...place, id: 3, name: "Museum", kind: "museum", class: "museum" }], { ...input, category: "food" });
  assert.equal(selected.length, 1);
  assert.equal(selected[0].hours, "");
  assert.equal(selected[0].website, "");
  assert.match(selected[0].sourceUrl, /mlat=/);
  assert.doesNotMatch(selected[0].sourceUrl, /\/node\//);
});

test("downloads actual selected tiles under a four-request cap and reuses their original dataset", async () => {
  let active = 0, peak = 0, requests = 0;
  const fetcher = async (url, { headers }) => {
    assert.match(headers["User-Agent"], /Bordone/);
    requests++; active++; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2)); active--;
    return url.endsWith("latest") ? metadata() : new Response(new Uint8Array([1, 2, 3]));
  };
  const download = createOfflineAreaService({ fetcher, decode: () => [place] });
  const result = await download(input);
  assert.equal(result.offlineArea, true);
  assert.equal(result.places.length, 1);
  assert.equal(result.datasetVersion, "20261018_080001_pt");
  assert.equal(result.sourceUpdatedAt, "2026-10-18T00:00:00.000Z");
  assert.ok(peak <= 4);
  const firstRequests = requests;
  const next = await download({ ...input, category: "food" });
  assert.equal(requests, firstRequests);
  assert.equal(next.sourceUpdatedAt, result.sourceUpdatedAt);
  assert.equal(next.downloadedBytes, 0);
});

test("a failed tile never creates a misleading complete offline result", async () => {
  let tiles = 0;
  const download = createOfflineAreaService({
    fetcher: async (url) => url.endsWith("latest") ? metadata() : (++tiles === 2 ? new Response("unavailable", { status: 503 }) : new Response(new Uint8Array([1]))),
    decode: () => [place],
  });
  await assert.rejects(download(input), /area download is unavailable/);
});

test("simultaneous area downloads share the global four-request ceiling", async () => {
  let active = 0, peak = 0;
  const download = createOfflineAreaService({ fetcher: async (url) => {
    active++; peak = Math.max(active, peak);
    await new Promise((resolve) => setTimeout(resolve, 3)); active--;
    return url.endsWith("latest") ? metadata() : new Response(new Uint8Array([1]));
  }, decode: () => [place] });
  await Promise.all([download(input), download({ ...input, lng: -79.9 })]);
  assert.ok(peak <= AREA_LIMITS.parallel);
});

test("metadata cannot redirect downloads to an arbitrary host", async () => {
  const download = createOfflineAreaService({ fetcher: async () => Response.json({ tiles: ["https://example.com/{z}/{x}/{y}.pbf"] }) });
  await assert.rejects(download(input), /format changed/);
});

test("an aborted caller stops all workers without returning partial data", async () => {
  let aborted = 0;
  const controller = new AbortController();
  const download = createOfflineAreaService({ fetcher: async (url, { signal }) => {
    if (url.endsWith("latest")) return metadata();
    return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => { aborted++; reject(new DOMException("Aborted", "AbortError")); }, { once: true });
    });
  } });
  const pending = download(input, { signal: controller.signal });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(pending, { name: "AbortError" });
  assert.ok(aborted > 0 && aborted <= 4);
});

test("oversized downloads fail within the conservative byte budget", async () => {
  const download = createOfflineAreaService({ fetcher: async (url) => url.endsWith("latest") ? metadata() : new Response(new Uint8Array(AREA_LIMITS.bytes + 1)), decode: () => [place] });
  await assert.rejects(download(input), /download limit/);
});
