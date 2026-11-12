// RFC 5545 subset: enough for venue and community calendars (The Events Calendar,
// Google Calendar, Squarespace, Tockify exports). Anything outside the subset is
// skipped and counted, never approximated.
import { hashId, makeEvent, validCoord } from "./normalize.js";
import { resolveTimeZone, zonedToMs, isoInZone, isoWithOffset, validDate } from "./time.js";

export function unfold(text) {
  return String(text).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "");
}
export function unescapeText(value) {
  return String(value).replace(/\\([\\;,nN])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));
}
// "NAME;P1=a;P2=\"b:c\":value" -> { name, params, value }. Colons inside quoted params do not end the name part.
export function parseLine(line) {
  let quoted = false, i = 0;
  for (; i < line.length; i++) { if (line[i] === '"') quoted = !quoted; else if (line[i] === ":" && !quoted) break; }
  if (i >= line.length) return null;
  const head = line.slice(0, i), value = line.slice(i + 1), parts = [];
  let cur = ""; quoted = false;
  for (const ch of head) { if (ch === '"') quoted = !quoted; if (ch === ";" && !quoted) { parts.push(cur); cur = ""; } else cur += ch; }
  parts.push(cur);
  const params = {};
  for (const p of parts.slice(1)) { const eq = p.indexOf("="); if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, ""); }
  return { name: parts[0].toUpperCase(), params, value };
}
function components(text) {
  const lines = unfold(text).split("\n"), events = [], stack = [];
  let calendar = false, calendarTz = "";
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const line = parseLine(raw);
    if (!line) continue;
    if (line.name === "BEGIN") { const kind = line.value.trim().toUpperCase(); if (kind === "VCALENDAR") calendar = true; stack.push(kind); if (kind === "VEVENT" && stack.length === 2) events.push({}); continue; }
    if (line.name === "END") { stack.pop(); continue; }
    if (stack.length === 1 && line.name === "X-WR-TIMEZONE") calendarTz = line.value.trim();
    if (stack.at(-1) === "VEVENT" && stack.length === 2) {
      const ev = events.at(-1);
      if (line.name === "EXDATE") (ev.EXDATE ||= []).push(line); else ev[line.name] ??= line;
    }
  }
  return { calendar, calendarTz, events };
}
// Returns { date: true|false, wall:{y,mo,d,h,mi,s}, ms, tz } or { error }.
export function parseDateValue(line, fallbackTz) {
  if (!line) return { error: "missing" };
  const v = line.value.trim(), dateOnly = line.params.VALUE === "DATE" || /^\d{8}$/.test(v);
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m || (dateOnly && m[4])) return { error: "badDate" };
  const wall = { y: +m[1], mo: +m[2], d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0) };
  if (!validDate(wall.y, wall.mo, wall.d) || wall.h > 23 || wall.mi > 59 || wall.s > 60) return { error: "badDate" };
  if (m[7]) return { date: false, wall, utc: true, ms: Date.UTC(wall.y, wall.mo - 1, wall.d, wall.h, wall.mi, wall.s), tz: fallbackTz || "" };
  // DATE values and floating times are both wall-clock; they need a zone to become instants.
  const tz = line.params.TZID ? resolveTimeZone(line.params.TZID) : resolveTimeZone(fallbackTz);
  if (!tz) return { error: line.params.TZID ? "unknownTimeZone" : "floatingWithoutZone" };
  return { date: dateOnly, wall, tz, ms: zonedToMs(wall, tz) };
}
// "P1W", "PT1H30M", "P1DT2H", "-PT15M" -> { days, seconds } or null.
export function parseDuration(value) {
  const m = String(value || "").trim().match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m || /^[+-]?PT?$/.test(value.trim())) return null;
  const sign = m[1] === "-" ? -1 : 1;
  return { days: sign * ((+m[2] || 0) * 7 + (+m[3] || 0)), seconds: sign * ((+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)) };
}
const addDays = (wall, n) => { const t = new Date(Date.UTC(wall.y, wall.mo - 1, wall.d + n)); return { ...wall, y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
const weekday = wall => new Date(Date.UTC(wall.y, wall.mo - 1, wall.d)).getUTCDay();
const DAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
// Only FREQ=DAILY|WEEKLY with INTERVAL, COUNT, UNTIL, BYDAY (plain weekdays), WKST. Anything else -> null.
export function parseRrule(value) {
  const rule = {};
  for (const part of String(value || "").trim().split(";").filter(Boolean)) { const [k, v] = part.split("="); if (!k || v === undefined) return null; rule[k.toUpperCase()] = v.toUpperCase(); }
  const allowed = new Set(["FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "WKST"]);
  if (!["DAILY", "WEEKLY"].includes(rule.FREQ) || Object.keys(rule).some(k => !allowed.has(k)) || (rule.COUNT && rule.UNTIL)) return null;
  const interval = rule.INTERVAL ? Number(rule.INTERVAL) : 1, count = rule.COUNT ? Number(rule.COUNT) : null;
  if (!Number.isInteger(interval) || interval < 1 || interval > 366 || (count !== null && (!Number.isInteger(count) || count < 1))) return null;
  const byday = rule.BYDAY ? rule.BYDAY.split(",") : null;
  if (byday && byday.some(d => !(d in DAYS))) return null;
  if (rule.WKST && !(rule.WKST in DAYS)) return null;
  return { freq: rule.FREQ, interval, count, until: rule.UNTIL || null, byday: byday && byday.map(d => DAYS[d]), wkst: DAYS[rule.WKST || "MO"] };
}
const MAX_STEPS = 5000;
// Yields wall-clock starts in order, starting with DTSTART itself (RFC 5545: DTSTART is always the first instance).
function* occurrences(start, rule) {
  if (rule.freq === "DAILY") {
    for (let i = 0, wall = start.wall; i < MAX_STEPS; i++, wall = addDays(start.wall, i * rule.interval))
      if (!rule.byday || rule.byday.includes(weekday(wall)) || i === 0) yield wall;
    return;
  }
  const days = rule.byday || [weekday(start.wall)];
  const weekStart = addDays(start.wall, -((weekday(start.wall) - rule.wkst + 7) % 7));
  yield start.wall;
  for (let week = 0; week < MAX_STEPS / 7; week += rule.interval)
    for (let i = 0; i < 7; i++) {
      const wall = addDays(weekStart, week * 7 + i);
      if (!days.includes(weekday(wall))) continue;
      const key = Date.UTC(wall.y, wall.mo - 1, wall.d), first = Date.UTC(start.wall.y, start.wall.mo - 1, start.wall.d);
      if (key > first) yield wall;
    }
}
function untilMs(until, start) {
  const m = until.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const wall = { y: +m[1], mo: +m[2], d: +m[3], h: +(m[4] || 23), mi: +(m[5] || 59), s: +(m[6] || 59) };
  if (!validDate(wall.y, wall.mo, wall.d)) return null;
  if (m[7] || !start.tz) return Date.UTC(wall.y, wall.mo - 1, wall.d, wall.h, wall.mi, wall.s);
  return zonedToMs(wall, start.tz);
}
const wallKey = w => `${w.y}-${w.mo}-${w.d}-${w.h}-${w.mi}-${w.s}`;
function locationName(value) {
  const text = String(value || "").trim();
  return text.split(/,\s*/)[0] || "";
}
const ONLINE = /^(virtual|online|zoom|webinar|livestream|live stream)\b/i;

/**
 * Parse an iCalendar feed into normalized events inside [from, to).
 * options: { from, to (ms), timeZone (used for floating and all-day values when the feed has no X-WR-TIMEZONE),
 *            sourceUrl, sourceName, fetchedAt, defaultCoords? }
 * Returns { events, skipped } where skipped counts what was left out and why.
 */
export function parseICal(text, { from, to, timeZone = "", sourceUrl = "", sourceName = "", fetchedAt = new Date().toISOString(), defaultCoords = null } = {}) {
  const { calendar, calendarTz, events: raw } = components(String(text || ""));
  if (!calendar) throw new Error("Not an iCalendar feed");
  const fallbackTz = resolveTimeZone(calendarTz) || resolveTimeZone(timeZone);
  const skipped = { cancelled: 0, unsupportedRule: 0, badDate: 0, unknownTimeZone: 0, online: 0, malformed: 0, truncated: 0 };
  const count = reason => { skipped[reason] = (skipped[reason] || 0) + 1; };
  const out = [];
  // RECURRENCE-ID overrides replace the matching generated instance of their series.
  const overrides = new Map();
  for (const ev of raw) if (ev["RECURRENCE-ID"] && ev.UID) {
    const rid = parseDateValue(ev["RECURRENCE-ID"], fallbackTz);
    if (!rid.error) (overrides.get(ev.UID.value) || overrides.set(ev.UID.value, new Set()).get(ev.UID.value)).add(rid.ms);
  }
  for (const ev of raw) {
    if (!ev.SUMMARY?.value.trim() || !ev.DTSTART) { count("malformed"); continue; }
    if (ev.STATUS?.value.trim().toUpperCase() === "CANCELLED") { count("cancelled"); continue; }
    const start = parseDateValue(ev.DTSTART, fallbackTz);
    if (start.error) { count(start.error === "badDate" || start.error === "missing" ? "badDate" : "unknownTimeZone"); continue; }
    const location = ev.LOCATION ? unescapeText(ev.LOCATION.value).trim() : "";
    if (ONLINE.test(location) || /^https?:\/\//i.test(location)) { count("online"); continue; }
    // Length of each instance: DTEND, else DURATION, else RFC defaults (1 day for DATE, 0 for DATE-TIME).
    // span is either { exactMs } (timed DTEND) or { days, seconds }: days are nominal
    // (same wall time on a later day, across DST), seconds are exact.
    let span = null;
    if (ev.DTEND) {
      const end = parseDateValue(ev.DTEND, start.tz || fallbackTz);
      if (end.error || end.date !== start.date) { count(end.error === "unknownTimeZone" ? "unknownTimeZone" : "badDate"); continue; }
      if (end.ms < start.ms) { count("badDate"); continue; }
      span = start.date ? { days: Math.round((Date.UTC(end.wall.y, end.wall.mo - 1, end.wall.d) - Date.UTC(start.wall.y, start.wall.mo - 1, start.wall.d)) / 86400000), seconds: 0 } : { exactMs: end.ms - start.ms };
    } else if (ev.DURATION) {
      const d = parseDuration(ev.DURATION.value);
      if (!d || d.days < 0 || d.seconds < 0) { count("badDate"); continue; }
      span = { days: d.days, seconds: d.seconds };
    } else if (start.date) span = { days: 1, seconds: 0 };
    let rule = null;
    if (ev.RRULE) { rule = parseRrule(ev.RRULE.value); if (!rule) { count("unsupportedRule"); continue; } }
    if (ev.RDATE) { count("unsupportedRule"); continue; }
    const geo = ev.GEO ? ev.GEO.value.split(";") : [];
    const coords = validCoord(geo[0]?.trim(), geo[1]?.trim()) || defaultCoords;
    const exdates = new Set((ev.EXDATE || []).flatMap(line => line.value.split(",").map(v => parseDateValue({ ...line, value: v }, start.tz || fallbackTz)).filter(x => !x.error).map(x => x.ms)));
    const replaced = ev["RECURRENCE-ID"] ? new Set() : overrides.get(ev.UID?.value) || new Set();
    const zone = start.utc ? fallbackTz : start.tz;
    const toMs = wall => (start.utc ? Date.UTC(wall.y, wall.mo - 1, wall.d, wall.h, wall.mi, wall.s) : zonedToMs(wall, start.tz));
    const instance = wall => {
      const ms = toMs(wall);
      const endMs = !span ? null : span.exactMs !== undefined ? ms + span.exactMs : toMs(addDays(wall, span.days)) + span.seconds * 1000;
      return { ms, endMs };
    };
    const fmt = ms => (zone ? isoInZone(ms, zone) : isoWithOffset(ms, 0));
    const emit = ({ ms, endMs }) => {
      if (exdates.has(ms) || replaced.has(ms)) return;
      const overlaps = endMs !== null && endMs > ms ? ms < to && endMs > from : ms >= from && ms < to;
      if (!overlaps) return;
      out.push(makeEvent({ id: hashId("ical", sourceUrl, ev.UID?.value || ev.SUMMARY.value + ev.DTSTART.value, String(ms)), title: unescapeText(ev.SUMMARY.value), venueName: locationName(location), coords, start: fmt(ms), end: endMs !== null && endMs > ms ? fmt(endMs) : "", url: ev.URL?.value.trim() || "", source: "ical", sourceName, fetchedAt }));
    };
    if (!rule) { emit(instance(start.wall)); continue; }
    const limit = rule.until ? untilMs(rule.until, start) : null;
    if (rule.until && limit === null) { count("unsupportedRule"); continue; }
    let n = 0, finished = false;
    for (const wall of occurrences(start, rule)) {
      const inst = instance(wall);
      if (limit !== null && inst.ms > limit) { finished = true; break; }
      if (rule.count !== null && n >= rule.count) { finished = true; break; }
      n++;
      if (inst.ms >= to) { finished = true; break; }
      emit(inst);
    }
    if (!finished && rule.count === null && limit === null) count("truncated");
  }
  return { events: out, skipped: Object.fromEntries(Object.entries(skipped).filter(([, v]) => v)) };
}
