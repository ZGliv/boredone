// What each place looks like on the map, and which badge wins when two would
// overlap. Pure: no MapLibre, no DOM, so the order is unit-tested.
//
// MapLibre places symbols in ascending sort key and drops any that would
// collide with one already placed, so the lower the rank the more often a
// place keeps its badge. Losers stay on the map as small dots.
//   0.x  done            (yours, gold)
//   1.x  planned / saved (on your pile, blue)
//   2.x  carries a guide note
//   3.x  everything else
// The fraction is the kind's share of the city, so a theatre or a bowling
// alley shows before the 900th restaurant at the same tier.
import { kindIcon } from "../ui/icons.js";

const TIER = { done: 0, planned: 1, saved: 1 };

export function markerTone(state) {
  if (state === "done") return "done";
  if (state === "saved" || state === "planned") return "saved";
  return "none";
}

export function markerTier(place, state) {
  if (state in TIER) return TIER[state];
  return place.recommendation?.text ? 2 : 3;
}

// Map of place id -> sort key.
export function markerRanks(places, states = new Map()) {
  const counts = new Map();
  for (const place of places) counts.set(place.category, (counts.get(place.category) || 0) + 1);
  const total = places.length || 1;
  const ranks = new Map();
  for (const place of places) {
    const share = Math.min(counts.get(place.category) / total, 0.999);
    ranks.set(place.id, markerTier(place, states.get(place.id)) + share);
  }
  return ranks;
}

export function placeFeatures(places, states = new Map()) {
  const ranks = markerRanks(places, states);
  return {
    type: "FeatureCollection",
    features: places.map((place) => ({
      type: "Feature",
      properties: { id: place.id, name: place.name, icon: kindIcon(place.category), tone: markerTone(states.get(place.id)), rank: ranks.get(place.id) },
      geometry: { type: "Point", coordinates: [place.lng, place.lat] },
    })),
  };
}

// The badge image names the symbol layers ask for; badges.js draws them on demand.
export const badgeName = (icon, tone, selected = false) => `${selected ? "pick" : "badge"}:${icon}:${tone}`;
export function parseBadgeName(name) {
  const [kind, icon, tone] = String(name).split(":");
  if ((kind !== "badge" && kind !== "pick") || !icon || !["done", "saved", "none"].includes(tone)) return null;
  return { icon, tone, selected: kind === "pick" };
}
