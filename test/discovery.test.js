import test from "node:test";
import assert from "node:assert/strict";
import {
  buildQuery,
  searchInput,
  normalizePlaces,
  discoveryHandler,
  createDiscoveryService,
} from "../server/discovery.js";
const input = { lat: 40.44, lng: -80, radius: 3000, category: "culture" };
test("queries are bounded and category input cannot inject Overpass statements", () => {
  const q = buildQuery(input);
  assert.ok(q.includes("[timeout:12][maxsize:16777216]"));
  assert.ok(q.includes("around:3000,40.44,-80"));
  assert.ok(q.endsWith("out center 1500;"));
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

const fixtureResponse = () => new Response(JSON.stringify({
  osm3s: { timestamp_osm_base: "2026-10-22T12:00:00Z" },
  elements: [{ type: "node", id: 101, lat: 40.44, lon: -80,
    tags: { name: "Source venue", tourism: "museum" } }],
}), { status: 200, headers: { "Content-Type": "application/json" } });

test("outage fallback preserves retrieval date and expires without extending its lifetime", async () => {
  const start = Date.parse("2026-10-23T12:00:00Z");
  let now = start, failing = false, calls = 0;
  const discover = createDiscoveryService({ clock: () => now, fetcher: async () => {
    calls++;
    if (failing) throw new Error("network unavailable");
    return fixtureResponse();
  } });
  const original = await discover(input);
  assert.equal(original.stale, false);
  failing = true;
  now += 29 * 60 * 1000;
  const warm = await discover(input);
  assert.equal(warm.cached, true);
  assert.equal(warm.stale, false);
  assert.equal(calls, 1);
  now = start + 31 * 60 * 1000;
  const stale = await discover(input);
  assert.equal(stale.stale, true);
  assert.equal(stale.fetchedAt, original.fetchedAt);
  assert.equal(stale.sourceUpdatedAt, original.sourceUpdatedAt);
  assert.deepEqual(stale.places, original.places);
  assert.match(stale.notice, /Live discovery is unavailable/);
  now = start + 23 * 60 * 60 * 1000;
  assert.equal((await discover(input)).fetchedAt, original.fetchedAt);
  now = start + 24 * 60 * 60 * 1000;
  await assert.rejects(discover(input), /place directory is unavailable/);
});

test("next uncached search prefers last successful provider even after failed-provider cooldown", async () => {
  let now = Date.parse("2026-10-23T12:00:00Z");
  const calls = [];
  let firstUrl;
  const discover = createDiscoveryService({ clock: () => now, fetcher: async (url) => {
    calls.push(url);
    firstUrl ??= url;
    if (url === firstUrl) throw new Error("unavailable");
    return fixtureResponse();
  } });
  const original = await discover(input);
  assert.equal(calls.length, 2);
  const successful = calls[1];
  now += 3 * 60 * 1000;
  const next = await discover({ ...input, category: "food" });
  assert.equal(calls.length, 3);
  assert.equal(calls[2], successful);
  assert.equal(next.providerName, original.providerName);
  assert.equal(next.cached, false);
});

test("identical concurrent searches share the upstream request", async () => {
  let release, calls = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  const discover = createDiscoveryService({ fetcher: async () => {
    calls++; await gate; return fixtureResponse();
  } });
  const a = discover(input), b = discover(input);
  assert.equal(calls, 1);
  release();
  const [left, right] = await Promise.all([a, b]);
  assert.deepEqual(left, right);
});

test("incomplete upstream data is not accepted or cached", async () => {
  let calls = 0;
  const discover = createDiscoveryService({ fetcher: async () => {
    calls++;
    if (calls === 1) return new Response(JSON.stringify({ elements: [], remark: "timed out" }));
    return fixtureResponse();
  } });
  const result = await discover(input);
  assert.equal(calls, 2);
  assert.equal(result.places.length, 1);
  assert.equal(result.stale, false);
});

const providers = [{url:"https://first.test",name:"First",home:"https://first.test"},{url:"https://second.test",name:"Second",home:"https://second.test"}];
test("slow primary is hedged, successful secondary wins and aborts loser", async () => {
  let cancelled = false, calls = 0;
  const discover = createDiscoveryService({providers,hedgeMs:10,deadlineMs:100,fetcher:async(url,{signal})=>{
    calls++;
    if(url===providers[0].url) return new Promise((resolve,reject)=>signal.addEventListener("abort",()=>{cancelled=true;reject(signal.reason)},{once:true}));
    return fixtureResponse();
  }});
  const result=await discover(input);
  assert.equal(result.providerName,"Second"); assert.equal(calls,2); assert.equal(cancelled,true);
});
test("one absolute deadline bounds hung providers without sequential timeout multiplication", async () => {
  let aborted=0;
  const discover=createDiscoveryService({providers,hedgeMs:5,deadlineMs:25,fetcher:async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener("abort",()=>{aborted++;reject(signal.reason)},{once:true}))});
  await assert.rejects(discover(input),/unavailable/); assert.equal(aborted,2);
});
test("shared search survives one cancellation and aborts after the last consumer leaves", async()=>{
  let upstreamSignal, release;
  const discover=createDiscoveryService({providers:[providers[0]],fetcher:async(url,{signal})=>{upstreamSignal=signal;return new Promise(resolve=>{release=()=>resolve(fixtureResponse())})}});
  const left=new AbortController(), right=new AbortController();
  const a=discover(input,{signal:left.signal}), b=discover(input,{signal:right.signal});
  left.abort(); await assert.rejects(a,{name:"AbortError"}); assert.equal(upstreamSignal.aborted,false);
  release(); assert.equal((await b).places.length,1);
  const c=discover({...input,category:"food"},{signal:right.signal});
  right.abort(); await assert.rejects(c,{name:"AbortError"}); assert.equal(upstreamSignal.aborted,true);
});
test("rate-limit cooldown is honored, successful empty directory results are valid",async()=>{
  let now=0,calls=0;
  const discover=createDiscoveryService({clock:()=>now,providers:[providers[0]],fetcher:async()=>{
    calls++; return calls===1?new Response("",{status:429,headers:{"Retry-After":"180"}}):new Response(JSON.stringify({elements:[]}));
  }});
  await assert.rejects(discover(input)); now=120001; await assert.rejects(discover(input)); assert.equal(calls,1);
  now=180001; assert.deepEqual((await discover(input)).places,[]); assert.equal(calls,2);
});
