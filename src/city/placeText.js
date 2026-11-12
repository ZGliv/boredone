// Short factual text about places and saves. Pure.
import { normalizeKind } from "../venues.js";
import { ELSEWHERE } from "../cityBoard.js";

const KIND_WORDS = { ice_cream: "Ice cream", biergarten: "Beer garden", amusement_arcade: "Arcade", escape_game: "Escape room", theatre: "Theatre" };
// "Coffee shop", "Music venue"; "" when the category is empty.
export function kindLabel(category = "") {
  const kind = normalizeKind(category);
  if (!kind) return "";
  if (KIND_WORDS[kind]) return KIND_WORDS[kind];
  const words = kind.replace(/_/g, " ");
  return words[0].toUpperCase() + words.slice(1);
}
// "Bar in Polish Hill", or just "Bar" when the neighbourhood is unknown.
export function placeLine(place) {
  const kind = kindLabel(place?.category);
  const hood = place?.neighborhood && place.neighborhood !== ELSEWHERE ? place.neighborhood : "";
  return kind && hood ? `${kind} in ${hood}` : kind || hood;
}
// Whole local days between two instants: "today", "3 days ago", "2 weeks ago".
export function ageText(fromIso, now = new Date()) {
  const from = new Date(fromIso);
  if (!Number.isFinite(from.getTime())) return "";
  const day = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
  const days = Math.max(0, day(now) - day(from));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "a year ago" : `${years} years ago`;
}
// "550 m", "1.2 km", "14 km".
export function distanceText(km) {
  if (!Number.isFinite(km)) return "";
  if (km < 1) return `${Math.max(50, Math.round(km * 20) * 50)} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}
export const count = (n) => Number(n || 0).toLocaleString("en-US");
