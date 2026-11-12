// schema.org Event extraction from a page's JSON-LD, plus a deliberately small
// fetcher for venue pages. The parser is pure; the fetcher takes its network
// (fetch and DNS lookup) by injection so tests never touch the internet.
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { cleanText, hashId, makeEvent, validCoord } from "./normalize.js";
import { parseOffsetIso, resolveTimeZone, zonedToMs, isoInZone, isoWithOffset, validDate } from "./time.js";

export const USER_AGENT = "Boredone/0.1 (personal outing planner; reads public event listings)";
const EVENT_TYPES = new Set(["Event", "Festival", "Hackathon", "CourseInstance"]);
const isEventType = type => [].concat(type || []).some(t => typeof t === "string" && (EVENT_TYPES.has(t.replace(/^https?:\/\/schema\.org\//, "")) || /Event$/.test(t)));
const schemaValue = v => String(v || "").replace(/^https?:\/\/schema\.org\//i, "");

export function jsonLdBlocks(html) {
  const blocks = [];
  const rx = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let m;
  while ((m = rx.exec(String(html || "")))) if (/type\s*=\s*["']?application\/ld\+json/i.test(m[1])) blocks.push(m[2].replace(/^\s*<!--/, "").replace(/-->\s*$/, "").trim());
  return blocks;
}
// Walks arrays, @graph, ItemList elements and subEvent, bounded in depth and count.
function collect(node, out, depth = 0) {
  if (!node || typeof node !== "object" || depth > 6 || out.length >= 500) return;
  if (Array.isArray(node)) { for (const n of node) collect(n, out, depth + 1); return; }
  if (isEventType(node["@type"])) out.push(node);
  for (const key of ["@graph", "itemListElement", "item", "subEvent", "event", "events"]) if (node[key]) collect(node[key], out, depth + 1);
}
// Date only -> all day in the source zone; offset times -> as given; floating times -> source zone or skipped.
function parseWhen(value, timeZone) {
  const text = String(value || "").trim();
  const exact = parseOffsetIso(text);
  if (exact) return { ms: exact.ms, offset: exact.offset };
  const tz = resolveTimeZone(timeZone);
  const date = text.match(/^(\d{4})-(\d{2})-(\d{2})$/), local = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
  const m = date || local;
  if (!m || !tz || !validDate(+m[1], +m[2], +m[3]) || (local && (+m[4] > 23 || +m[5] > 59))) return null;
  const wall = { y: +m[1], mo: +m[2], d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0) };
  // A date-only endDate is inclusive, so the event runs to the following local midnight (not +24 h on DST days).
  const next = new Date(Date.UTC(wall.y, wall.mo - 1, wall.d + 1));
  return { ms: zonedToMs(wall, tz), tz, allDay: !!date, ...(date ? { nextDayMs: zonedToMs({ y: next.getUTCFullYear(), mo: next.getUTCMonth() + 1, d: next.getUTCDate() }, tz) } : {}) };
}
function resolveUrl(raw, base) {
  try { const u = new URL(String(raw || "").trim(), base || undefined); return ["http:", "https:"].includes(u.protocol) ? u.href : ""; } catch { return ""; }
}

/**
 * Extract normalized events from an HTML string.
 * options: { baseUrl, sourceName, fetchedAt, timeZone, from, to (ms; optional window) }
 * Returns { events, skipped }.
 */
export function extractEvents(html, { baseUrl = "", sourceName = "", fetchedAt = new Date().toISOString(), timeZone = "", from = -Infinity, to = Infinity } = {}) {
  const skipped = {}, count = r => { skipped[r] = (skipped[r] || 0) + 1; };
  const nodes = [];
  for (const block of jsonLdBlocks(html)) {
    let data;
    try { data = JSON.parse(block); } catch { try { data = JSON.parse(block.replace(/[\u0000-\u001f]+/g, " ")); } catch { count("invalidJson"); continue; } }
    collect(data, nodes);
  }
  const events = [];
  for (const node of nodes) {
    const title = cleanText(node.name, 300);
    if (!title || !node.startDate) { count("malformed"); continue; }
    const status = schemaValue(node.eventStatus);
    if (/Cancelled|Canceled/i.test(status)) { count("cancelled"); continue; }
    if (/Postponed/i.test(status)) { count("postponed"); continue; }
    if (/MovedOnline/i.test(status) || /OnlineEventAttendanceMode/i.test(schemaValue(node.eventAttendanceMode))) { count("online"); continue; }
    const places = [].concat(node.location || []);
    const place = places.find(p => typeof p === "string" || (p && !/VirtualLocation/.test([].concat(p["@type"] || []).join(" "))));
    if (!place && places.length) { count("online"); continue; }
    const start = parseWhen(node.startDate, timeZone);
    if (!start) { count("badDate"); continue; }
    const end = node.endDate ? parseWhen(node.endDate, timeZone) : null;
    if (node.endDate && !end) { count("badDate"); continue; }
    let endMs = end ? (end.allDay ? end.nextDayMs : end.ms) : start.allDay ? start.nextDayMs : null;
    if (endMs !== null && endMs < start.ms) { count("badDate"); continue; }
    if (endMs === start.ms) endMs = null;
    const inWindow = endMs !== null ? start.ms < to && endMs > from : start.ms >= from && start.ms < to;
    if (!inWindow) continue;
    const zone = start.tz || resolveTimeZone(timeZone);
    const fmt = (ms, offset) => (zone ? isoInZone(ms, zone) : isoWithOffset(ms, offset ?? 0));
    const venueName = typeof place === "string" ? place : cleanText(place?.name, 200);
    const geo = typeof place === "object" ? [].concat(place?.geo || [])[0] : null;
    const coords = geo ? validCoord(geo.latitude, geo.longitude) : null;
    const url = resolveUrl(node.url || node["@id"], baseUrl) || resolveUrl(baseUrl);
    events.push(makeEvent({ id: hashId("jsonld", url, title, String(start.ms)), title, venueName, coords, start: fmt(start.ms, start.offset), end: endMs !== null ? fmt(endMs, end?.offset ?? start.offset) : "", url, source: "jsonld", sourceName, fetchedAt }));
  }
  return { events, skipped };
}

// ---------- bounded fetcher ----------
function privateV4(ip) {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}
export function isPrivateAddress(address) {
  const ip = String(address || "").replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(ip) === 4) return privateV4(ip);
  if (isIP(ip) !== 6) return true;
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return privateV4(mapped[1]);
  if (/^::ffff:/.test(ip)) return true;
  // "::" prefix covers ::, ::1 and IPv4-compatible forms such as ::7f00:1.
  return /^::/.test(ip) || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || /^ff/.test(ip) || /^64:ff9b:/.test(ip) || /^2001:db8:/.test(ip);
}
export async function checkPublicUrl(raw, lookup = dnsLookup) {
  let url;
  try { url = new URL(raw); } catch { throw new Error("Invalid URL"); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http and https are allowed");
  if (url.username || url.password) throw new Error("Credentials in URLs are not allowed");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("Non-standard ports are not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!host || host === "localhost" || /\.(localhost|local|internal|home|lan)$/.test(host) || (!isIP(host) && !host.includes("."))) throw new Error("Private address");
  if (isIP(host)) { if (isPrivateAddress(host)) throw new Error("Private address"); return url; }
  const addresses = await lookup(host, { all: true });
  if (!addresses?.length || addresses.some(a => isPrivateAddress(a.address))) throw new Error("Private address");
  return url;
}
// RFC 9309: the most specific matching group (our token, else *), longest matching rule wins, Allow wins ties.
export function robotsAllows(robotsText, path, agent = "boredone") {
  const groups = [];
  let current = null, lastWasAgent = false;
  for (const raw of String(robotsText || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim(), i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase(), value = line.slice(i + 1).trim();
    if (key === "user-agent") { if (!lastWasAgent) groups.push((current = { agents: [], rules: [] })); current.agents.push(value.toLowerCase()); lastWasAgent = true; continue; }
    lastWasAgent = false;
    if ((key === "allow" || key === "disallow") && current) current.rules.push({ allow: key === "allow", path: value });
  }
  const mine = groups.filter(g => g.agents.some(a => a !== "*" && agent.toLowerCase().startsWith(a)));
  const rules = (mine.length ? mine : groups.filter(g => g.agents.includes("*"))).flatMap(g => g.rules).filter(r => r.path);
  let best = null;
  for (const r of rules) {
    const pattern = new RegExp("^" + r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (pattern.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}
const utf8 = bytes => new TextDecoder().decode(bytes);
async function readCapped(response, maxBytes, controller, decode = utf8) {
  const declared = Number(response.headers.get("content-length"));
  if (declared > maxBytes) { controller.abort(); throw new Error("Response too large"); }
  if (!response.body?.getReader) { const bytes = Buffer.from(await response.text()); if (bytes.length > maxBytes) throw new Error("Response too large"); return decode(bytes); }
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { controller.abort(); reader.cancel().catch(() => {}); throw new Error("Response too large"); }
    chunks.push(value);
  }
  return decode(Buffer.concat(chunks.map(c => Buffer.from(c))));
}
const REDIRECTS = [301, 302, 303, 307, 308];
/**
 * fetchPublic(url, { fetcher, lookup, timeoutMs, maxBytes, accept, robotsCache, clock, decode })
 * GET a public page: http(s) only, no private/loopback targets (checked on every redirect),
 * robots.txt honoured, hard timeout and byte cap. decode turns the body bytes into text.
 * Resolves to { url, text, contentType }.
 */
export async function fetchPublic(raw, { fetcher = fetch, lookup = dnsLookup, timeoutMs = 8000, maxBytes = 1_500_000, accept = /^(text\/html|application\/xhtml\+xml)/i, robotsCache = new Map(), clock = Date.now, decode = utf8 } = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(new Error("Timed out")), timeoutMs);
  const get = (url, extra = {}) => fetcher(url, { signal: controller.signal, redirect: "manual", headers: { "User-Agent": USER_AGENT, ...extra } });
  try {
    let url = raw;
    for (let hop = 0; hop < 4; hop++) {
      const target = await checkPublicUrl(url, lookup);
      const cached = robotsCache.get(target.origin);
      let robots = cached && clock() - cached.at < 3600000 ? cached.text : null;
      if (robots === null) {
        // RFC 9309 2.3.1.2: follow up to five redirects (each target re-checked); still
        // redirected after that counts as unavailable, like a 4xx.
        let robotsUrl = target.origin + "/robots.txt", r = await get(robotsUrl, { Accept: "text/plain" });
        for (let i = 0; i < 5 && REDIRECTS.includes(r.status) && r.headers.get("location"); i++) {
          robotsUrl = (await checkPublicUrl(new URL(r.headers.get("location"), robotsUrl).href, lookup)).href;
          r = await get(robotsUrl, { Accept: "text/plain" });
        }
        // RFC 9309: 4xx means no restrictions; 5xx or unreachable means assume full disallow.
        robots = r.status >= 500 ? "User-agent: *\nDisallow: /" : r.ok ? await readCapped(r, 500_000, controller) : "";
        robotsCache.set(target.origin, { text: robots, at: clock() });
      }
      if (!robotsAllows(robots, target.pathname + target.search)) throw new Error("Disallowed by robots.txt");
      const response = await get(target.href);
      if (REDIRECTS.includes(response.status)) {
        const next = response.headers.get("location");
        if (!next) throw new Error("Redirect without location");
        url = new URL(next, target).href;
        continue;
      }
      if (!response.ok) throw new Error(`Source responded ${response.status}`);
      const contentType = response.headers.get("content-type") || "";
      if (!accept.test(contentType)) throw new Error("Unexpected content type");
      return { url: target.href, text: await readCapped(response, maxBytes, controller, decode), contentType };
    }
    throw new Error("Too many redirects");
  } catch (e) {
    if (controller.signal.aborted && !/too large/i.test(e.message)) throw new Error("Timed out");
    throw e;
  } finally { clearTimeout(timer); }
}
