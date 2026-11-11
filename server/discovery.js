import { VENUE_KINDS } from '../src/venues.js';
import { diversePool } from './place-pool.js';
const PROVIDERS = [
  {
    url: "https://overpass.private.coffee/api/interpreter",
    name: "Private.coffee",
    home: "https://overpass.private.coffee/",
  },
  {
    url: "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    name: "VK Maps",
    home: "https://maps.mail.ru/osm/tools/overpass/",
  },
];
const CATEGORIES = {
  outdoors:
    'nwr["leisure"~"^(park|garden|nature_reserve)$"]["name"];nwr["tourism"="viewpoint"]["name"];',
  culture:
    'nwr["tourism"~"^(museum|gallery|attraction)$"]["name"];nwr["amenity"~"^(arts_centre|theatre|cinema)$"]["name"];',
  food: 'nwr["amenity"~"^(cafe|restaurant|ice_cream|bar|pub|biergarten|nightclub)$"]["name"];nwr["shop"="bakery"]["name"];',
  play: 'nwr["leisure"~"^(bowling_alley|miniature_golf|escape_game|sports_centre)$"]["name"];',
};
export function searchInput(query) {
  const lat = Number(query.get("lat")),
    lng = Number(query.get("lng")),
    radius = Number(query.get("radius") || 3000),
    category = query.get("category") || "all";
  if (
    !query.get("lat")?.trim() ||
    !query.get("lng")?.trim() ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -85 ||
    lat > 85 ||
    lng < -180 ||
    lng > 180 ||
    ![1500, 3000, 5000].includes(radius) ||
    !["all", ...Object.keys(CATEGORIES)].includes(category)
  )
    throw new Error("Choose a valid city, category and search radius.");
  return {
    lat: Math.round(lat * 100) / 100,
    lng: Math.round(lng * 100) / 100,
    radius,
    category,
  };
}
export function buildQuery({ lat, lng, radius, category }) {
  const selectors =
    category === "all"
      ? 'nwr["amenity"~"^(restaurant|cafe|bar|pub|biergarten|nightclub|ice_cream|cinema|theatre|music_venue|comedy_club)$"]["name"];nwr["shop"="bakery"]["name"];nwr["leisure"~"^(bowling_alley|miniature_golf|escape_game|amusement_arcade)$"]["name"];'
      : CATEGORIES[category];
  return `[out:json][timeout:12][maxsize:16777216];(${selectors.replaceAll("nwr[", `nwr(around:${radius},${lat},${lng})[`)});out center 1500;`;
}
export function safeUrl(raw) {
  try {
    const u = new URL(raw);
    return ["https:", "http:"].includes(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
}
export function distanceKm(a, b) {
  const r = Math.PI / 180,
    dlat = (a.lat - b.lat) * r,
    dlng = (a.lng - b.lng) * r;
  return (
    6371 *
    2 *
    Math.atan2(
      Math.sqrt(
        Math.sin(dlat / 2) ** 2 +
          Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dlng / 2) ** 2,
      ),
      Math.sqrt(
        1 -
          (Math.sin(dlat / 2) ** 2 +
            Math.cos(a.lat * r) *
              Math.cos(b.lat * r) *
              Math.sin(dlng / 2) ** 2),
      ),
    )
  );
}
export function normalizePlaces(data, center) {
  const seen = new Set();
  return diversePool((data.elements || [])
    .flatMap((e) => {
      const t = e.tags || {},
        lat = Number(e.lat ?? e.center?.lat),
        lng = Number(e.lon ?? e.center?.lon);
      if (
        !t.name ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        t.access === "private" ||
        t.disused === "yes" ||
        t.abandoned === "yes" ||
        (center.category === "all" && !VENUE_KINDS.has(t.amenity || t.tourism || t.leisure || t.shop || "")) ||
        (center.radius &&
          distanceKm(center, { lat, lng }) > center.radius / 1000)
      )
        return [];
      const key =
        t.name.toLowerCase() + ":" + lat.toFixed(3) + ":" + lng.toFixed(3);
      if (seen.has(key)) return [];
      seen.add(key);
      const type = t.amenity || t.tourism || t.leisure || t.shop || "place";
      return [
        {
          id: `osm-${e.type}-${e.id}`,
          name: t.name.slice(0, 180),
          lat,
          lng,
          category: type.replaceAll("_", " "),
          address: [t["addr:housenumber"], t["addr:street"], t["addr:city"]]
            .filter(Boolean)
            .join(" "),
          website: safeUrl(t.website || t["contact:website"]),
          source: "OpenStreetMap",
          sourceUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
          hours: (t.opening_hours || "").slice(0, 400),
          fee:
            t.fee === "no"
              ? "No entry fee listed"
              : t.fee === "yes"
                ? "Entry fee listed"
                : "Price not listed",
          access: (t.wheelchair || "").slice(0, 40),
          distanceKm: Math.round(distanceKm(center, { lat, lng }) * 10) / 10,
        },
      ];
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    );
}
const FRESH_MS = 30 * 60 * 1000;
const RETAIN_MS = 24 * 60 * 60 * 1000;
const unavailableMessage = "The place directory is unavailable right now. Try again shortly or keep exploring your saved results. Your plans and memories are still available.";
const abortError = () => new DOMException("Search cancelled", "AbortError");

export function createDiscoveryService({
  fetcher = (...args) => fetch(...args), clock = Date.now,
  providers: suppliedProviders, hedgeMs = 1500, deadlineMs = 22000,
} = {}) {
  const cache = new Map(), inflight = new Map(), unavailableUntil = new Map();
  let preferredProviderUrl = null;
  function providerList() {
    return (suppliedProviders || (process.env.BOREDONE_OVERPASS_URL ? [{
      url: process.env.BOREDONE_OVERPASS_URL,
      name: process.env.BOREDONE_OVERPASS_NAME || "Configured Overpass provider",
      home: process.env.BOREDONE_OVERPASS_HOME || "https://www.openstreetmap.org/",
    }] : [...PROVIDERS].reverse())).filter(p => (unavailableUntil.get(p.url) || 0) <= clock())
      .sort((a,b) => Number(b.url === preferredProviderUrl) - Number(a.url === preferredProviderUrl)).slice(0,2);
  }
  async function upstream(input, signal) {
    const providers = providerList();
    if (!providers.length) throw new Error(unavailableMessage);
    return new Promise((resolve, reject) => {
      const controllers = new Set();
      let next = 0, active = 0, finished = false, hedge;
      function finish(error, value) {
        if (finished) return;
        finished = true; clearTimeout(hedge); clearTimeout(deadline);
        signal.removeEventListener("abort", cancelled);
        for (const controller of controllers) controller.abort();
        error ? reject(error) : resolve(value);
      }
      const cancelled = () => finish(abortError());
      const deadline = setTimeout(() => {
        for (const candidate of providers) unavailableUntil.set(candidate.url, clock() + 30000);
        finish(new Error(unavailableMessage));
      }, deadlineMs);
      signal.addEventListener("abort", cancelled, {once:true});
      if (signal.aborted) { cancelled(); return; }
      async function launch() {
        if (finished || next >= providers.length) return;
        const provider = providers[next++], controller = new AbortController();
        controllers.add(controller); active++;
        try {
          const response = await fetcher(provider.url, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json", "User-Agent": "Boredone/0.2 (+https://project-room-alpha.vercel.app/)" },
            body: new URLSearchParams({data: buildQuery(input)}), signal: controller.signal,
          });
          if (!response.ok) {
            const retry = Number(response.headers?.get("Retry-After"));
            const cooldown = response.status === 429 ? Math.max(120000, Math.min(300000, (retry || 120) * 1000)) : 30000;
            unavailableUntil.set(provider.url, clock() + cooldown);
            throw new Error("upstream unavailable");
          }
          const data = await response.json();
          if (data.remark || !Array.isArray(data.elements)) throw new Error("upstream incomplete");
          if (finished) return;
          preferredProviderUrl = provider.url;
          finish(null, {data, provider});
        } catch {
          if (finished) return; // cancelled losers must not poison provider health
          if (!unavailableUntil.has(provider.url) || unavailableUntil.get(provider.url) <= clock()) unavailableUntil.set(provider.url, clock() + 30000);
          active--;
          if (next < providers.length) { clearTimeout(hedge); launch(); }
          else if (!active) finish(new Error(unavailableMessage));
        }
      }
      launch();
      hedge = setTimeout(launch, hedgeMs);
    });
  }
  async function run(input, signal) {
    const key = JSON.stringify(input), prior = cache.get(key);
    try {
      const {data, provider} = await upstream(input, signal);
      const result = {
        places: normalizePlaces(data, input), fetchedAt: new Date(clock()).toISOString(),
        sourceUpdatedAt: data.osm3s?.timestamp_osm_base || null,
        attribution: "© OpenStreetMap contributors", source: `OpenStreetMap via ${provider.name}`,
        providerName: provider.name, providerUrl: provider.home,
        center: {lat: input.lat, lng: input.lng}, radius: input.radius, category: input.category,
        cached: false, stale: false,
      };
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(key, {time: clock(), result});
      return result;
    } catch (error) {
      if (signal.aborted) throw abortError();
      if (prior && clock() - prior.time < RETAIN_MS) return {
        ...prior.result, cached: true, stale: true,
        notice: "Live discovery is unavailable. Showing previously retrieved places; check the venue before going.",
      };
      throw error;
    }
  }
  return function discover(input, {signal} = {}) {
    if (signal?.aborted) return Promise.reject(abortError());
    const key = JSON.stringify(input), prior = cache.get(key);
    if (prior && clock() - prior.time < FRESH_MS) return Promise.resolve({...prior.result, cached:true});
    let entry = inflight.get(key);
    if (!entry) {
      if (inflight.size >= 3) return Promise.reject(new Error(unavailableMessage));
      entry = {controller: new AbortController(), consumers: 0};
      inflight.set(key, entry);
      entry.task = run(input, entry.controller.signal).finally(() => { if(inflight.get(key) === entry) inflight.delete(key); });
    }
    entry.consumers++;
    return new Promise((resolve, reject) => {
      let settled = false;
      function settle(error, value) {
        if (settled) return;
        settled = true; signal?.removeEventListener("abort", cancel); entry.consumers--;
        if (!entry.consumers && inflight.get(key) === entry) {
          inflight.delete(key); entry.controller.abort();
        }
        error ? reject(error) : resolve(value);
      }
      const cancel = () => settle(abortError());
      signal?.addEventListener("abort", cancel, {once:true});
      entry.task.then(value => settle(null,value), error => settle(error));
    });
  };
}
const discover = createDiscoveryService();
export async function discoveryHandler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    res.end(JSON.stringify({ error: "Only GET is supported." }));
    return;
  }
  let input;
  try {
    input = searchInput(new URL(req.url, "http://local").searchParams);
  } catch (e) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: e.message }));
    return;
  }
  try {
    const controller = new AbortController();
    const disconnected = () => { if (!res.writableEnded) controller.abort(); };
    res.on?.("close", disconnected);
    let result;
    try { result = await discover(input, {signal:controller.signal}); }
    finally { res.off?.("close", disconnected); }
    if (controller.signal.aborted) return;
    res.setHeader(
      "Cache-Control",
      result.stale
        ? "no-store"
        : "public, max-age=0, s-maxage=1800",
    );
    res.end(JSON.stringify(result));
  } catch (e) {
    if (res.destroyed) return;
    res.statusCode = 503;
    res.setHeader("Cache-Control", "no-store");
    res.end(
      JSON.stringify({
        error:
          e.name === "TimeoutError"
            ? "Search took too long. Try a smaller area. Your saved outings are unaffected."
            : e.message?.startsWith("The place directory")
              ? e.message
              : "Could not reach the place directory. Check your connection and try again.",
      }),
    );
  }
}
