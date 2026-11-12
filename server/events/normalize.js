import { createHash } from "node:crypto";
import { safeUrl } from "../discovery.js";
export { safeUrl };
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…" };
export function decodeEntities(text = "") {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code) => {
    if (code[0] !== "#") return NAMED[code.toLowerCase()] ?? all;
    const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : all;
  });
}
export function cleanText(text, max = 300) {
  return decodeEntities(decodeEntities(String(text ?? ""))).replace(/<[^>]*>/g, " ").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
const STOP = new Set(["the", "and", "a", "an", "at"]);
export const textWords = value => cleanText(value, 400).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/['\u2019]/g, "").split(/[^a-z0-9]+/).filter(w => w && !STOP.has(w));
export const textKey = value => textWords(value).join("");
export const hashId = (prefix, ...parts) => prefix + "-" + createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 20);
export function validCoord(lat, lng) {
  const a = typeof lat === "string" && lat.trim() ? Number(lat) : lat, b = typeof lng === "string" && lng.trim() ? Number(lng) : lng;
  return typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a === 0 && b === 0) ? { lat: a, lng: b } : null;
}
// The one shape every source produces. Unknown values stay empty or null; nothing is filled in.
export function makeEvent({ id, title, venueName = "", coords = null, start, end = "", url = "", source, sourceName, fetchedAt }) {
  return { id, title: cleanText(title, 300), venueName: cleanText(venueName, 200), lat: coords?.lat ?? null, lng: coords?.lng ?? null, start, end: end || "", url: safeUrl(url), source, sourceName: cleanText(sourceName, 120), placeId: "", fetchedAt };
}
