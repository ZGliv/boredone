// Ticketmaster Discovery API v2, event search.
// Docs: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
// Default quota: 5000 calls/day, 5 requests/second; deep paging stops at size*page < 1000.
import { hashId, makeEvent, validCoord } from "./normalize.js";
import { isoInZone, resolveTimeZone, zonedToMs, validDate } from "./time.js";

export const TICKETMASTER_ENDPOINT = "https://app.ticketmaster.com/discovery/v2/events.json";
const PAGE_SIZE = 100, MAX_PAGES = 3;
const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
// The docs mark latlong as deprecated in favour of geoPoint (a geohash).
export function geohash(lat, lng, precision = 9) {
  let latR = [-90, 90], lngR = [-180, 180], bits = 0, bit = 0, even = true, out = "";
  while (out.length < precision) {
    const range = even ? lngR : latR, value = even ? lng : lat, mid = (range[0] + range[1]) / 2;
    if (value >= mid) { bits = (bits << 1) | 1; range[0] = mid; } else { bits <<= 1; range[1] = mid; }
    even = !even;
    if (++bit === 5) { out += BASE32[bits]; bits = 0; bit = 0; }
  }
  return out;
}
// Ticketmaster rejects milliseconds: the documented form is 2016-07-27T23:30:00Z.
const tmTime = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
export function buildTicketmasterUrl({ lat, lng, radiusKm, from, to, page = 0 }, apiKey) {
  const url = new URL(TICKETMASTER_ENDPOINT);
  url.search = new URLSearchParams({ apikey: apiKey, geoPoint: geohash(lat, lng), radius: String(Math.max(1, Math.ceil(radiusKm))), unit: "km", startDateTime: tmTime(from), endDateTime: tmTime(to), size: String(PAGE_SIZE), page: String(page), sort: "date,asc", locale: "*" });
  return url;
}
function startOf(dates, tz) {
  const s = dates?.start || {};
  if (s.dateTBD || s.dateTBA) return null;
  if (s.dateTime && !s.timeTBA && !s.noSpecificTime) { const ms = Date.parse(s.dateTime); return Number.isFinite(ms) && /Z$|[+-]\d{2}:?\d{2}$/.test(s.dateTime) ? { ms, allDay: false } : null; }
  // A date with no time is shown as the whole local day, which needs the venue's zone.
  const m = String(s.localDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m || !tz || !validDate(+m[1], +m[2], +m[3])) return null;
  return { ms: zonedToMs({ y: +m[1], mo: +m[2], d: +m[3] }, tz), allDay: true, wall: { y: +m[1], mo: +m[2], d: +m[3] } };
}
export function normalizeTicketmaster(data, { fetchedAt = new Date().toISOString() } = {}) {
  const skipped = {}, count = r => { skipped[r] = (skipped[r] || 0) + 1; }, events = [];
  for (const e of data?._embedded?.events || []) {
    if (!e?.id || !e.name) { count("malformed"); continue; }
    const status = String(e.dates?.status?.code || "").toLowerCase();
    if (status === "canceled" || status === "cancelled") { count("cancelled"); continue; }
    if (status === "postponed") { count("postponed"); continue; }
    const venue = e._embedded?.venues?.[0] || {};
    const tz = resolveTimeZone(e.dates?.timezone) || resolveTimeZone(venue.timezone);
    const start = startOf(e.dates, tz);
    if (!start) { count("noDate"); continue; }
    let endMs = null;
    const end = e.dates?.end;
    if (end?.dateTime && !end.noSpecificTime && !end.approximate) { const ms = Date.parse(end.dateTime); if (Number.isFinite(ms) && ms > start.ms) endMs = ms; }
    if (start.allDay && endMs === null) { const next = new Date(Date.UTC(start.wall.y, start.wall.mo - 1, start.wall.d + 1)); endMs = zonedToMs({ y: next.getUTCFullYear(), mo: next.getUTCMonth() + 1, d: next.getUTCDate() }, tz); }
    events.push(makeEvent({ id: "tm-" + String(e.id).slice(0, 80), title: e.name, venueName: venue.name || "", coords: validCoord(venue.location?.latitude, venue.location?.longitude), start: isoInZone(start.ms, tz), end: endMs !== null ? isoInZone(endMs, tz) : "", allDay: start.allDay, url: e.url || "", source: "ticketmaster", sourceName: "Ticketmaster", fetchedAt }));
  }
  return { events, skipped, page: data?.page || null };
}
/**
 * searchTicketmaster({ lat, lng, radiusKm, from, to }, { fetcher, apiKey, signal, clock })
 * Always resolves; failures come back as { status, code, error } so one source never blanks the others.
 */
export async function searchTicketmaster(input, { fetcher = fetch, apiKey = process.env.TICKETMASTER_API_KEY, signal, clock = Date.now } = {}) {
  if (!apiKey) return { status: "unavailable", code: 503, error: "Ticketmaster is not configured (TICKETMASTER_API_KEY is not set).", events: [] };
  const fetchedAt = new Date(clock()).toISOString(), events = [], skipped = {};
  for (let page = 0; page < MAX_PAGES; page++) {
    let response;
    try { response = await fetcher(buildTicketmasterUrl({ ...input, page }, apiKey), { signal, headers: { Accept: "application/json" } }); }
    catch { return { status: "error", code: 503, error: "Could not reach Ticketmaster.", events }; }
    if (response.status === 401 || response.status === 403) return { status: "error", code: 503, error: "Ticketmaster rejected the API key.", events };
    if (response.status === 429) return { status: page ? "partial" : "error", code: 503, error: "Ticketmaster rate limit reached.", events };
    if (!response.ok) return { status: page ? "partial" : "error", code: 503, error: `Ticketmaster responded ${response.status}.`, events };
    let data;
    try { data = await response.json(); } catch { return { status: page ? "partial" : "error", code: 503, error: "Ticketmaster sent an unreadable response.", events }; }
    const result = normalizeTicketmaster(data, { fetchedAt });
    events.push(...result.events);
    for (const [k, v] of Object.entries(result.skipped)) skipped[k] = (skipped[k] || 0) + v;
    const p = result.page;
    if (!p || p.number + 1 >= p.totalPages || (page + 2) * PAGE_SIZE >= 1000) break;
  }
  return { status: "ok", events, skipped };
}
