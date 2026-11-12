// "What is on tonight": merges Ticketmaster with public venue/community calendars.
// Each source is fetched independently and reports its own status, so one failure
// never empties the list.
import { distanceKm } from "../discovery.js";
import { textKey, textWords } from "./normalize.js";
import { parseOffsetIso } from "./time.js";
import { searchTicketmaster } from "./ticketmaster.js";
import { parseICal } from "./ical.js";
import { extractEvents, fetchPublic } from "./jsonld.js";
import { CITY_SOURCES } from "./sources.js";

const MAX_WINDOW_MS = 7 * 86400000, SAME_START_MS = 30 * 60000, SAME_PLACE_KM = 0.2;
const startMs = e => parseOffsetIso(e.start)?.ms ?? NaN;
const hasCoords = e => Number.isFinite(e.lat) && Number.isFinite(e.lng) && e.lat !== null && e.lng !== null;

export function eventsInput(params) {
  const lat = Number(params.get("lat")), lng = Number(params.get("lng")), radiusKm = params.get("radiusKm") ? Number(params.get("radiusKm")) : 10;
  const from = parseOffsetIso(params.get("from")), to = parseOffsetIso(params.get("to"));
  if (!params.get("lat")?.trim() || !params.get("lng")?.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) throw new Error("Choose a valid location.");
  if (!Number.isFinite(radiusKm) || radiusKm < 0.5 || radiusKm > 50) throw new Error("Choose a search radius between 0.5 and 50 km.");
  if (!from || !to || to.ms <= from.ms || to.ms - from.ms > MAX_WINDOW_MS) throw new Error("Choose a time window of up to 7 days, as ISO dates with a time-zone offset.");
  return { lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000, radiusKm, from: from.ms, to: to.ms };
}

function sameEvent(a, b) {
  const ka = textKey(a.title);
  if (!ka || ka !== textKey(b.title) || !(Math.abs(startMs(a) - startMs(b)) <= SAME_START_MS)) return false;
  if (hasCoords(a) && hasCoords(b)) return distanceKm(a, b) <= SAME_PLACE_KM;
  const va = textKey(a.venueName);
  return !!va && va === textKey(b.venueName);
}
const RANK = { ticketmaster: 0, jsonld: 1, ical: 2 };
const better = (a, b) => (hasCoords(a) !== hasCoords(b) ? hasCoords(a) : (RANK[a.source] ?? 9) <= (RANK[b.source] ?? 9));
// Same normalized title, starts within 30 minutes, and within 200 m (or the same venue
// name when either side has no coordinates). The richer record wins; blanks are filled from the other.
export function mergeEvents(lists) {
  const kept = [];
  for (const event of lists.flat()) {
    if (!Number.isFinite(startMs(event))) continue;
    const i = kept.findIndex(k => sameEvent(k, event));
    if (i < 0) { kept.push({ ...event }); continue; }
    const [win, lose] = better(kept[i], event) ? [kept[i], event] : [event, kept[i]];
    kept[i] = { ...win, ...(hasCoords(win) ? {} : { lat: lose.lat, lng: lose.lng }), end: win.end || lose.end, url: win.url || lose.url, venueName: win.venueName || lose.venueName };
  }
  return kept.sort((a, b) => startMs(a) - startMs(b) || a.title.localeCompare(b.title));
}
// Equal names, or one name's words appear as a whole run inside the other
// ("Thunderbird Music Hall" ~ "Thunderbird Music Hall at Butler", not "Spirit" ~ "Spiritual Center").
function namesAgree(a, b) {
  if (!a.length || !b.length) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.join("").length < 6 && short.length !== long.length) return false;
  for (let i = 0; i + short.length <= long.length; i++) if (short.every((w, j) => long[i + j] === w)) return true;
  return false;
}
// Pure. Links an event to a known place only when the venue name and coordinates agree.
export function linkToPlace(event, places = []) {
  const words = textWords(event?.venueName);
  if (!words.length || !hasCoords(event)) return { ...event, placeId: "" };
  let best = null, bestKm = Infinity;
  for (const p of places) {
    if (!p?.id || !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || !namesAgree(words, textWords(p.name))) continue;
    const km = distanceKm(event, p);
    if (km <= SAME_PLACE_KM && km < bestKm) { best = p; bestKm = km; }
  }
  return { ...event, placeId: best ? best.id : "" };
}

export function createEventsService({ fetcher = fetch, lookup, clock = Date.now, sources = CITY_SOURCES, apiKey = () => process.env.TICKETMASTER_API_KEY, timeoutMs = 10000 } = {}) {
  const pages = new Map(), tmCache = new Map(), robotsCache = new Map();
  const remember = (map, key, value, max = 24) => { map.set(key, value); while (map.size > max) map.delete(map.keys().next().value); };
  // Calendar files and pages are cached for 30 minutes so window changes do not refetch them.
  async function page(source) {
    const saved = pages.get(source.url);
    if (saved && clock() - saved.at < 1800000) return saved;
    const accept = source.kind === "ical" ? /^(text\/calendar|text\/plain|application\/octet-stream)/i : undefined;
    const got = await fetchPublic(source.url, { fetcher, ...(lookup ? { lookup } : {}), timeoutMs, maxBytes: source.kind === "ical" ? 3_000_000 : 1_500_000, robotsCache, clock, ...(accept ? { accept } : {}) });
    const value = { text: got.text, url: got.url, at: clock(), fetchedAt: new Date(clock()).toISOString() };
    remember(pages, source.url, value);
    return value;
  }
  async function runCity(source, input) {
    const got = await page(source);
    const options = { from: input.from, to: input.to, timeZone: source.timeZone, sourceName: source.name, fetchedAt: got.fetchedAt };
    return source.kind === "ical" ? parseICal(got.text, { ...options, sourceUrl: source.url }) : extractEvents(got.text, { ...options, baseUrl: got.url });
  }
  async function runTicketmaster(input) {
    // Query whole hours so nearby windows share one upstream call; the exact window is applied below.
    const hour = 3600000, q = { lat: Math.round(input.lat * 100) / 100, lng: Math.round(input.lng * 100) / 100, radiusKm: input.radiusKm, from: Math.floor(input.from / hour) * hour, to: Math.ceil(input.to / hour) * hour };
    const key = JSON.stringify(q), saved = tmCache.get(key);
    if (saved && clock() - saved.at < 900000) return saved.result;
    const result = await searchTicketmaster(q, { fetcher, apiKey: apiKey(), signal: AbortSignal.timeout(timeoutMs), clock });
    if (result.status === "ok") remember(tmCache, key, { result, at: clock() });
    return result;
  }
  return async input => {
    const applicable = sources.filter(s => distanceKm(input, s.area) <= s.area.radiusKm);
    const jobs = [{ id: "ticketmaster", kind: "ticketmaster", name: "Ticketmaster", run: () => runTicketmaster(input) }, ...applicable.map(s => ({ id: s.id, kind: s.kind, name: s.name, home: s.home, run: () => runCity(s, input).then(r => ({ status: "ok", ...r })) }))];
    const settled = await Promise.allSettled(jobs.map(j => j.run()));
    const lists = [], status = [];
    settled.forEach((r, i) => {
      const job = jobs[i], value = r.status === "fulfilled" ? r.value : { status: "error", error: "Source unavailable.", events: [] };
      const inside = (value.events || []).filter(e => {
        const s = startMs(e), end = e.end ? parseOffsetIso(e.end)?.ms : null;
        const inWindow = end && end > s ? s < input.to && end > input.from : s >= input.from && s < input.to;
        return inWindow && (!hasCoords(e) || distanceKm(input, e) <= input.radiusKm);
      });
      lists.push(inside);
      status.push({ id: job.id, kind: job.kind, name: job.name, ...(job.home ? { url: job.home } : {}), status: value.status, count: inside.length, ...(value.skipped && Object.keys(value.skipped).length ? { skipped: value.skipped } : {}), ...(value.error ? { error: value.error } : {}) });
    });
    return { events: mergeEvents(lists), sources: status, window: { from: new Date(input.from).toISOString(), to: new Date(input.to).toISOString() }, center: { lat: input.lat, lng: input.lng }, radiusKm: input.radiusKm, fetchedAt: new Date(clock()).toISOString() };
  };
}

const service = createEventsService();
export async function eventsHandler(req, res, run = service) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") { res.statusCode = 405; res.setHeader("Allow", "GET"); res.end(JSON.stringify({ error: "Only GET is supported." })); return; }
  let input;
  try { input = eventsInput(new URL(req.url, "http://local").searchParams); }
  catch (e) { res.statusCode = 400; res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify({ error: e.message })); return; }
  try {
    const result = await run(input);
    const attempted = result.sources.filter(s => s.status !== "unavailable");
    const failed = attempted.filter(s => s.status !== "ok");
    if (attempted.length && failed.length === attempted.length && !result.events.length) res.statusCode = 503;
    // Short CDN cache when every reachable source answered; never cache a partial list.
    res.setHeader("Cache-Control", failed.length ? "no-store" : "public, max-age=0, s-maxage=600");
    res.end(JSON.stringify(result));
  } catch {
    res.statusCode = 503;
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ error: "Could not load events right now. Your saved places are unaffected." }));
  }
}
