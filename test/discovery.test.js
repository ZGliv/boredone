import test from "node:test";
import assert from "node:assert/strict";
import {
  buildQuery,
  searchInput,
  normalizePlaces,
  discoveryHandler,
} from "../server/discovery.js";
const input = { lat: 40.44, lng: -80, radius: 3000, category: "culture" };
test("queries are bounded and category input cannot inject Overpass statements", () => {
  const q = buildQuery(input);
  assert.ok(q.includes("[timeout:25][maxsize:16777216]"));
  assert.ok(q.includes("around:3000,40.44,-80"));
  assert.ok(q.endsWith("out center tags 180;"));
  for (const args of [
    "lat=0&lng=0&category=foo",
    "lat=0&lng=0&radius=900000",
    "lat=NaN&lng=0",
    "lng=0",
    "lat=91&lng=0",
  ])
    assert.throws(() => searchInput(new URLSearchParams(args)));
});
test("precise coordinates are rounded before query and caching", () => {
  assert.deepEqual(
    searchInput(new URLSearchParams("lat=40.440623&lng=-79.995891")),
    { lat: 40.44, lng: -80, radius: 3000, category: "all" },
  );
});
test("normalization keeps source IDs and links, drops inaccessible places, and sorts by distance", () => {
  const elements = [
    {
      type: "node",
      id: 1,
      lat: 40.44,
      lon: -80,
      tags: { name: "Nearby", amenity: "cafe", website: "javascript:alert(1)" },
    },
    {
      type: "way",
      id: 2,
      center: { lat: 40.46, lon: -80 },
      tags: { name: "Museum", tourism: "museum" },
    },
    {
      type: "node",
      id: 3,
      lat: 40.44,
      lon: -80,
      tags: { name: "Private", access: "private", amenity: "cafe" },
    },
    {
      type: "node",
      id: 4,
      lat: 40.44,
      lon: -80,
      tags: { name: "Nearby", amenity: "cafe" },
    },
  ];
  const result = normalizePlaces({ elements }, input);
  assert.equal(result.length, 2);
  assert.equal(result[0].name, "Nearby");
  assert.equal(result[0].website, "");
  assert.equal(result[1].sourceUrl, "https://www.openstreetmap.org/way/2");
});
test("invalid and unsupported API calls never reach upstream", async () => {
  const response = () => ({
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(v) {
      this.body = JSON.parse(v);
    },
  });
  const a = response();
  await discoveryHandler({ method: "POST", url: "/" }, a);
  assert.equal(a.statusCode, 405);
  const b = response();
  await discoveryHandler({ method: "GET", url: "/?lat=91&lng=0" }, b);
  assert.equal(b.statusCode, 400);
});
test("upstream failure becomes a retryable error without leaking internals", async () => {
  const old = global.fetch;
  global.fetch = async () => {
    throw new Error("PRIVATE_RUNTIME_DETAIL");
  };
  const res = {
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(v) {
      this.body = JSON.parse(v);
    },
  };
  try {
    await discoveryHandler({ method: "GET", url: "/?lat=20&lng=20" }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.headers["Cache-Control"], "no-store");
    assert.ok(!JSON.stringify(res.body).includes("PRIVATE_RUNTIME_DETAIL"));
  } finally {
    global.fetch = old;
  }
});
