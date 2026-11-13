// What each place looks like on the map, and which badge wins when two would
// overlap. Pure: no MapLibre, no DOM, so the order is unit-tested.
//
// MapLibre places symbols in ascending sort key and drops any that would
// collide with one already placed, so the lower the rank the more often a
// place keeps its badge. Losers stay on the map as small dots.
//   0.x  done            (yours, gold)
//   1.x  planned / saved (on your pile, blue)
//   2.x  has a photo     (a round photo pin)
//   3.x  carries a guide note
//   4.x  everything else
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
  if (hasPhoto(place)) return 2;
  return place.recommendation?.text ? 3 : 4;
}

// The atlas cell a place's pin photo sits in, or -1 for none.
export const photoCell = (place) => (hasPhoto(place) ? place.mapPhoto.index : -1);
const hasPhoto = (place) => Number.isInteger(place.mapPhoto?.index) && place.mapPhoto.index >= 0;

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
      properties: { id: place.id, name: place.name, icon: kindIcon(place.category), tone: markerTone(states.get(place.id)), rank: ranks.get(place.id), photo: photoCell(place) },
      geometry: { type: "Point", coordinates: [place.lng, place.lat] },
    })),
  };
}

// The image names the symbol layers ask for; badges.js draws them on demand.
//   badge:<icon>:<tone>  pick:<icon>:<tone>    kind badges, plain and selected
//   photo:<cell>:<tone>  pickphoto:<cell>:<tone> photo pins from the atlas
export const badgeName = (icon, tone, selected = false) => `${selected ? "pick" : "badge"}:${icon}:${tone}`;
export const photoName = (cell, tone, selected = false) => `${selected ? "pickphoto" : "photo"}:${cell}:${tone}`;
const TONES = ["done", "saved", "none"];
export function parseBadgeName(name) {
  const [kind, icon, tone] = String(name).split(":");
  if ((kind !== "badge" && kind !== "pick") || !icon || !TONES.includes(tone)) return null;
  return { icon, tone, selected: kind === "pick" };
}
export function parsePhotoName(name) {
  const [kind, cell, tone] = String(name).split(":");
  if ((kind !== "photo" && kind !== "pickphoto") || !/^\d+$/.test(cell || "") || !TONES.includes(tone)) return null;
  return { cell: Number(cell), tone, selected: kind === "pickphoto" };
}

// District names for the map, from the places' own neighbourhoods (the tiles
// carry almost none for these cities). One point per neighbourhood with at
// least `min` places, at the median of its places so a stray outlier cannot
// drag it. Names sit under the pins and ignore them, so they never hide one;
// instead each gets the first DISTRICT_BANDS zoom at which it is at least
// DISTRICT_GAP px from every bigger district shown by then, and the map shows
// it from that zoom. Bigger districts claim their place first.
export const DISTRICT_BANDS = [12, 13, 14, 15];
const DISTRICT_GAP = 120;
export function districtFeatures(places, min = 8) {
  const groups = new Map();
  for (const place of places) {
    const name = typeof place.neighborhood === "string" ? place.neighborhood.trim() : "";
    if (!name || name === "Elsewhere" || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) continue;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(place);
  }
  const median = (values) => { const v = [...values].sort((a, b) => a - b), m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
  const all = [...groups].filter(([, group]) => group.length >= min)
    .map(([name, group]) => ({ name, size: group.length, lng: median(group.map((p) => p.lng)), lat: median(group.map((p) => p.lat)) }))
    .sort((a, b) => b.size - a.size || a.name.localeCompare(b.name));
  const shown = [], features = [];
  for (const district of all) {
    const band = DISTRICT_BANDS.find((zoom) => shown.every((other) => other.band > zoom || pixels(district, other, zoom) >= DISTRICT_GAP));
    if (band === undefined) continue;
    shown.push({ ...district, band });
    features.push({ type: "Feature", properties: { name: district.name, size: district.size, band }, geometry: { type: "Point", coordinates: [district.lng, district.lat] } });
  }
  return { type: "FeatureCollection", features };
}
// Screen distance between two points at a zoom (512 px tiles, Web Mercator).
function pixels(a, b, zoom) {
  const world = 512 * 2 ** zoom;
  const x = (p) => ((p.lng + 180) / 360) * world;
  const y = (p) => ((1 - Math.log(Math.tan(Math.PI / 4 + (p.lat * Math.PI) / 360)) / Math.PI) / 2) * world;
  return Math.hypot(x(a) - x(b), y(a) - y(b));
}
