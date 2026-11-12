// The Pile's pure logic: grouping, the short facts each row shows, reading a
// pasted share, and turning resolver answers into "Is this the place?" picks.
// No React, no storage, no network.
import { localDate } from "../model.js";
import { expiringSoon, isExpired, lastDay } from "../saves.js";
import { matchCandidates, distanceKm, nameTokens } from "../saveMatch.js";
import { parseSaveUrl, splitShare, TRACKING } from "../saveSource.js";

const DAY = 86400000;
const RESET_HOURS = 5;
const hasPoint = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng);
const savedAt = (save) => save?.source?.savedAt || save?.createdAt || "";
const dayNumber = (iso) => Date.parse(`${iso}T12:00:00Z`) / DAY;

// "Tonight" runs until 5 am, the same session day decide.js uses.
export function tonightDate(now = new Date()) {
  return localDate(new Date(now.getTime() - RESET_HOURS * 3600000));
}

// One field takes a link, words, or a share-sheet blob of both.
export function readInput(value = "") {
  const raw = String(value).trim();
  if (!raw) return { url: "", text: "" };
  // "instagram.com/reel/x" pasted alone, without a scheme.
  if (!/\s/.test(raw) && parseSaveUrl(raw).app !== "note") return { url: cleanLink(raw), text: "" };
  const share = splitShare("", raw);
  return { url: share.url ? cleanLink(share.url) : "", text: share.text };
}

// Share sheets add parameters that identify the sharer; a private save keeps
// the link without them.
export function cleanLink(value = "") {
  let text = String(value).trim();
  if (!text) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;
  try {
    const url = new URL(text);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
    return url.toString();
  } catch {
    return "";
  }
}

const APP_NAME = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", "google-maps": "Google Maps" };
const KIND_NAME = {
  instagram: { reel: "Reel", post: "post", video: "video", profile: "profile", story: "story" },
  youtube: { short: "Short", video: "video", profile: "channel" },
  tiktok: { profile: "profile" },
};
// What the save came from: "Instagram Reel", "TikTok", "eater.com", "Note".
export function sourceName(save) {
  const url = save?.source?.url || "";
  if (!url) return "Note";
  const link = parseSaveUrl(url);
  if (link.app === "web" || link.app === "note") {
    try { return new URL(url).hostname.replace(/^(www|m)\./, ""); } catch { return "Link"; }
  }
  const kind = KIND_NAME[link.app]?.[link.kind];
  return kind ? `${APP_NAME[link.app]} ${kind}` : APP_NAME[link.app];
}

// "today", "yesterday", "3 days ago", "2 weeks ago": the same words
// decide.js uses for "Saved 3 weeks ago" on Tonight.
export function ageWords(fromIso, now = new Date()) {
  const from = new Date(fromIso);
  if (!Number.isFinite(from.getTime())) return "";
  const days = Math.max(0, Math.round((Date.parse(localDate(now)) - Date.parse(localDate(from))) / DAY));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "a year ago" : `${years} years ago`;
}

// The compact age at the end of a row: "today", "9 d", "2 wk", "3 mo", "1 yr".
export function shortAge(fromIso, now = new Date()) {
  const from = new Date(fromIso);
  if (!Number.isFinite(from.getTime())) return "";
  const days = Math.max(0, Math.round((Date.parse(localDate(now)) - Date.parse(localDate(from))) / DAY));
  if (days === 0) return "today";
  if (days < 14) return `${days} d`;
  if (days < 60) return `${Math.floor(days / 7)} wk`;
  if (days < 365) return `${Math.floor(days / 30)} mo`;
  return `${Math.floor(days / 365)} yr`;
}

// "Saved 3 weeks ago", "Saved today": one wording on every sheet and on Tonight.
export function savedText(save, now = new Date()) {
  const age = ageWords(savedAt(save), now);
  return age ? `Saved ${age}` : "";
}

// "Instagram Reel · Saved today".
export function fromLine(save, now = new Date()) {
  return [sourceName(save), savedText(save, now)].filter(Boolean).join(" · ");
}

// What to call a save that has no place yet: its words with @handles and
// #tags reduced to plain words, else where it came from.
export function saveTitle(save) {
  const text = String(save?.source?.text || "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/(^|\s)[@#](?=\w)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return text || sourceName(save);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const monthDay = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
// The clock on a save, or "": "Tonight", "Ends Saturday", "Nov 14", "Ended Nov 3".
export function clockText(save, today = localDate()) {
  const day = lastDay(save);
  if (!day) return "";
  // "this Saturday only" gives the same day as both date and end.
  const ends = !!save.source.expiresAt && save.source.expiresAt !== save.source.eventDate;
  const ahead = dayNumber(day) - dayNumber(today);
  if (ahead < 0) return `Ended ${monthDay(day)}`;
  if (ahead === 0) return ends ? "Ends today" : "Today";
  if (ahead === 1) return ends ? "Ends tomorrow" : "Tomorrow";
  const name = ahead < 7 ? WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()] : monthDay(day);
  return ends ? `Ends ${name}` : name;
}

// Splits the pile into what the screen shows, in order:
//   soon      a clock within a week (soonest first)
//   unplaced  no place yet (newest first)
//   placed    closest first when `near` is known, otherwise newest first
//   past      the clock ran out; kept, never deleted (most recent first)
// placeOf(save) returns the place to measure from (city record or the save's own).
export function groupPile(saves = [], { today = localDate(), near = null, placeOf = (s) => s.place } = {}) {
  const live = saves.filter((s) => s?.status === "saved");
  const newest = (a, b) => savedAt(b).localeCompare(savedAt(a)) || a.id.localeCompare(b.id);
  const past = live.filter((s) => isExpired(s, today)).sort((a, b) => lastDay(b).localeCompare(lastDay(a)) || newest(a, b));
  const soon = expiringSoon(live, today);
  const taken = new Set([...past, ...soon].map((s) => s.id));
  const rest = live.filter((s) => !taken.has(s.id));
  const unplaced = rest.filter((s) => !s.place).sort(newest);
  const origin = hasPoint(near) ? near : null;
  const km = (s) => { const p = placeOf(s); return origin && hasPoint(p) ? distanceKm(origin, p) : Infinity; };
  const placed = rest.filter((s) => s.place).sort((a, b) => (origin ? km(a) - km(b) : 0) || newest(a, b));
  return { soon, unplaced, placed, past, byDistance: !!origin };
}

// Distance from the user, or null when either point is unknown.
export function kmFrom(near, place) {
  return hasPoint(near) && hasPoint(place) ? distanceKm(near, place) : null;
}

// The one fact from saveMatch's reason that tells this candidate apart:
// "One of 3 locations", "Different kind of place", or nothing. "Same name"
// is what the card already shows; the distance is measured from the search
// centre, not the user; a chain count equal to the card's own counter
// (`total`) says nothing new.
export function reasonText(reason = "", total = 0) {
  const parts = String(reason).split(" · ");
  const chain = parts.map((p) => /^one of (\d+) locations$/.exec(p)).find(Boolean);
  if (chain && Number(chain[1]) !== total) return `One of ${chain[1]} locations`;
  if (parts.includes("different kind of place")) return "Different kind of place";
  return "";
}

// Resolver candidates -> one queue of places to ask about, best first, each
// place once. Each entry keeps the candidate it came from (its words and dates).
export function candidateQueue(candidates = [], places = [], near = null) {
  const seen = new Set(), queue = [];
  const areas = near?.city ? [String(near.city)] : [];
  for (const { candidate, matches } of matchCandidates(candidates, places, near, { areas })) {
    for (const match of matches) {
      if (seen.has(match.place.id)) continue;
      seen.add(match.place.id);
      queue.push({ place: match.place, reason: match.reason, score: match.score, candidate });
    }
  }
  return queue;
}

// Dates the caption gave, for a save that has none of its own yet.
export function captionDates(save, candidate) {
  const source = save.source || {};
  if (source.eventDate || source.expiresAt || !candidate) return null;
  const eventDate = candidate.eventDate || "", expiresAt = candidate.expiresAt || "";
  return eventDate || expiresAt ? { eventDate, expiresAt } : null;
}

// Searching the city's places by name. Every word typed must start a word of
// the name; whole-name prefixes rank first, then nearer, then shorter names.
export function searchPlaces(places = [], query = "", { near = null, limit = 8 } = {}) {
  const words = nameTokens(query);
  if (!words.length || words.join("").length < 2) return [];
  const origin = hasPoint(near) ? near : null;
  const hits = [];
  for (const place of places) {
    const tokens = nameTokens(place.name);
    if (!words.every((w) => tokens.some((t) => t.startsWith(w)))) continue;
    // "The Church Brew Works" is found as "church brew".
    const core = tokens[0] === "the" && tokens.length > 1 ? tokens.slice(1) : tokens;
    const joined = core.join(" "), typed = words.join(" ");
    const rank = joined === typed ? 0 : joined.startsWith(typed) ? 1 : ` ${joined}`.includes(` ${typed}`) ? 2 : core[0].startsWith(words[0]) ? 3 : 4;
    hits.push({ place, rank, km: origin && hasPoint(place) ? distanceKm(origin, place) : Infinity });
  }
  hits.sort((a, b) => a.rank - b.rank || a.km - b.km || a.place.name.length - b.place.name.length || a.place.name.localeCompare(b.place.name));
  return hits.slice(0, limit).map((hit) => hit.place);
}

// POST /api/resolve-save. Never throws: every failure comes back as
// {status: "error", reason: "offline" | "busy" | "failed"} so the caller can
// keep the save as a note.
export async function requestResolve({ url = "", text = "", near = null, today = "" } = {}, { fetchImpl = globalThis.fetch, online = true } = {}) {
  if (!online) return { status: "error", reason: "offline" };
  const body = { url, text, today };
  if (hasPoint(near)) body.near = { lat: near.lat, lng: near.lng, ...(near.city ? { city: String(near.city).slice(0, 100) } : {}) };
  let response;
  try {
    response = await fetchImpl("/api/resolve-save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return { status: "error", reason: "offline" };
  }
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok) return { status: "error", reason: response.status === 429 || data?.error === "resolver_busy" ? "busy" : "failed" };
  if (!data || !["resolved", "unresolved", "needs-text"].includes(data.status)) return { status: "error", reason: "failed" };
  return { status: data.status, candidates: Array.isArray(data.candidates) ? data.candidates : [] };
}

export const ERROR_TEXT = { offline: "Offline. Kept as a note", busy: "Busy. Kept as a note", failed: "Lookup failed. Kept as a note" };
