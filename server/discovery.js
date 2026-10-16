const cache = new Map();
const inflight = new Map();
const unavailableUntil = new Map();
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
  food: 'nwr["amenity"~"^(cafe|restaurant|ice_cream)$"]["name"];',
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
      ? Object.values(CATEGORIES).join("")
      : CATEGORIES[category];
  return `[out:json][timeout:25][maxsize:16777216];(${selectors.replaceAll("nwr[", `nwr(around:${radius},${lat},${lng})[`)});out center tags 180;`;
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
  return (data.elements || [])
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
        (center.radius &&
          distanceKm(center, { lat, lng }) > center.radius / 1000)
      )
        return [];
      const key =
        t.name.toLowerCase() + ":" + lat.toFixed(3) + ":" + lng.toFixed(3);
      if (seen.has(key)) return [];
      seen.add(key);
      const type = t.amenity || t.tourism || t.leisure || "place";
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
    .slice(0, 120);
}
async function discover(input) {
  const key = JSON.stringify(input),
    prior = cache.get(key);
  if (prior && Date.now() - prior.time < 30 * 60 * 1000)
    return { ...prior.result, cached: true };
  if (inflight.has(key)) return inflight.get(key);
  const task = (async () => {
    if (inflight.size >= 4)
      throw new Error(
        "The place directory is busy. Please try again in a minute. Your plans and memories are still available.",
      );
    const providers = process.env.BOREDONE_OVERPASS_URL
      ? [
          {
            url: process.env.BOREDONE_OVERPASS_URL,
            name:
              process.env.BOREDONE_OVERPASS_NAME ||
              "Configured Overpass provider",
            home:
              process.env.BOREDONE_OVERPASS_HOME ||
              "https://www.openstreetmap.org/",
          },
        ]
      : PROVIDERS;
    let data, provider;
    for (const candidate of providers) {
      if ((unavailableUntil.get(candidate.url) || 0) > Date.now()) continue;
      try {
        const response = await fetch(candidate.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent":
              "Boredone/0.1 (+https://project-room-alpha.vercel.app/)",
          },
          body: new URLSearchParams({ data: buildQuery(input) }),
          signal: AbortSignal.timeout(28000),
        });
        if (!response.ok) throw new Error("upstream unavailable");
        const body = await response.json();
        if (body.remark || !Array.isArray(body.elements))
          throw new Error("upstream incomplete");
        data = body;
        provider = candidate;
        break;
      } catch {
        unavailableUntil.set(candidate.url, Date.now() + 120000);
      }
    }
    if (!data)
      throw new Error(
        "The place directory is busy. Please try again in a minute. Your plans and memories are still available.",
      );
    const result = {
      places: normalizePlaces(data, input),
      fetchedAt: new Date().toISOString(),
      sourceUpdatedAt: data.osm3s?.timestamp_osm_base || null,
      attribution: "© OpenStreetMap contributors",
      source: `OpenStreetMap via ${provider.name}`,
      providerName: provider.name,
      providerUrl: provider.home,
      center: { lat: input.lat, lng: input.lng },
      radius: input.radius,
      cached: false,
    };
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(key, { time: Date.now(), result });
    return result;
  })().finally(() => inflight.delete(key));
  inflight.set(key, task);
  return task;
}
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
    const result = await discover(input);
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=1800, stale-while-revalidate=3600",
    );
    res.end(JSON.stringify(result));
  } catch (e) {
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
