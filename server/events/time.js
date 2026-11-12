// Time-zone arithmetic without a library. Every conversion goes through Intl so
// daylight-saving rules come from the runtime's IANA database, never a table here.
const formatters = new Map();
function formatter(timeZone) {
  if (!formatters.has(timeZone)) formatters.set(timeZone, new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  return formatters.get(timeZone);
}
export function validTimeZone(timeZone) {
  if (!timeZone || typeof timeZone !== "string") return "";
  try { formatter(timeZone); return timeZone; } catch { return ""; }
}
// TZIDs in the wild are often prefixed ("/freeassociation.sourceforge.net/America/New_York").
// Only an exact IANA name, or an IANA name at the end of the TZID, is accepted.
export function resolveTimeZone(tzid) {
  const raw = String(tzid || "").replace(/^"|"$/g, "").trim();
  if (validTimeZone(raw)) return raw;
  const parts = raw.split("/").filter(Boolean);
  for (const n of [3, 2]) if (parts.length > n) { const tail = parts.slice(-n).join("/"); if (/^[A-Za-z_]+\/[A-Za-z_+\-0-9/]+$/.test(tail) && validTimeZone(tail)) return tail; }
  return "";
}
export function offsetMinutes(ms, timeZone) {
  const p = Object.fromEntries(formatter(timeZone).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}
// Wall-clock time in a zone -> instant. Ambiguous times (the repeated hour in
// November) take the first occurrence; times inside the spring-forward gap use
// the offset from before the gap. Both follow RFC 5545 section 3.3.5.
export function zonedToMs({ y, mo, d, h = 0, mi = 0, s = 0 }, timeZone) {
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  const before = offsetMinutes(wall - 86400000, timeZone), after = offsetMinutes(wall + 86400000, timeZone);
  const valid = [...new Set([before, after])].map(o => wall - o * 60000).filter(ms => offsetMinutes(ms, timeZone) * 60000 === wall - ms);
  return valid.length ? Math.min(...valid) : wall - before * 60000;
}
const pad = (n, w = 2) => String(Math.abs(n)).padStart(w, "0");
export function isoWithOffset(ms, offset) {
  const t = new Date(ms + offset * 60000);
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}${offset < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}
// ISO 8601 with the zone's offset at that instant, or UTC (+00:00) when the zone is unknown.
export function isoInZone(ms, timeZone) {
  return isoWithOffset(ms, validTimeZone(timeZone) ? offsetMinutes(ms, timeZone) : 0);
}
export function wallParts(ms, timeZone) {
  const p = Object.fromEntries(formatter(timeZone).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}
// Parses ISO 8601 with an explicit offset or Z. Returns null for anything else,
// so a floating "2026-11-13T20:00" is never silently read in the server's zone.
export function parseOffsetIso(value) {
  const m = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i);
  if (!m) return null;
  const [, y, mo, d, h, mi, s = "0", z] = m;
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31 || +h > 23 || +mi > 59 || +s > 60) return null;
  const offset = /^z$/i.test(z) ? 0 : (z[0] === "-" ? -1 : 1) * (+z.slice(1, 3) * 60 + +z.slice(-2));
  const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) - offset * 60000;
  return Number.isFinite(ms) && new Date(Date.UTC(+y, +mo - 1, +d)).getUTCDate() === +d ? { ms, offset } : null;
}
export function validDate(y, mo, d) {
  return mo >= 1 && mo <= 12 && d >= 1 && new Date(Date.UTC(y, mo - 1, d)).getUTCDate() === d;
}
