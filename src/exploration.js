import { venueGroup } from "./venues.js";

// A place gets one pin even when the journal contains several visits.
// Prefer the most recent visit so its current metadata wins deterministically.
export function journalPlaces(outings, status) {
  const places = new Map();
  const rows = outings.filter((outing) => outing.status === status && outing.place).sort((a, b) =>
    (b.visitDate || b.planDate || "").localeCompare(a.visitDate || a.planDate || "") ||
    b.updatedAt.localeCompare(a.updatedAt));
  for (const outing of rows) {
    if (!places.has(outing.place.id)) places.set(outing.place.id, outing.place);
  }
  return [...places.values()];
}

export function pinStatus(placeId, outings) {
  if (outings.some((outing) => outing.status === "planned" && outing.place?.id === placeId)) return "planned";
  if (outings.some((outing) => outing.status === "visited" && outing.place?.id === placeId)) return "visited";
  return "discovered";
}

export const LANDMARKS = [
  { id: "garden", title: "Fresh air", label: "Outside", category: "outdoors" },
  { id: "cafe", title: "Small comforts", label: "Food & coffee", category: "food" },
  { id: "gallery", title: "Curious corners", label: "Arts & culture", category: "culture" },
  { id: "play", title: "Just for fun", label: "Something playful", category: "play" },
];
// Landmark for a venue kind comes from its venue group, so a brewery or a
// nightclub is never filed under Outside and a biergarten never under Arts.
// The word patterns are only for older free-text map categories.
const GROUP_LANDMARK = { food: "cafe", coffee: "cafe", drinks: "cafe", culture: "gallery", play: "play" };
export function placeKind(category = "") {
  const group = venueGroup(category);
  if (group) return GROUP_LANDMARK[group];
  const value = String(category || "").toLowerCase();
  if (/cafe|café|coffee|food|restaurant|bakery|bar|pub|tea|ice.cream/.test(value)) return "cafe";
  if (/art.studio/.test(value)) return "play";
  if (/art|museum|gallery|theatre|theater|culture|library|cinema|attraction/.test(value)) return "gallery";
  if (/play|arcade|game|bowling|sport|escape|miniature/.test(value)) return "play";
  return "garden";
}
export function collectionStamps(outings) {
  const visits = outings.filter((outing) => outing.status === "visited" && outing.place);
  return LANDMARKS.map((kind) => ({ ...kind, count: new Set(visits.filter((outing) => placeKind(outing.place.category) === kind.id).map((outing) => outing.place.id)).size }));
}
export function chooseUnvisited(places, outings, currentId, random = Math.random) {
  const visited = new Set(outings.filter((outing) => outing.status === "visited" && outing.place).map((outing) => outing.place.id));
  const newPlaces = places.filter((place) => !visited.has(place.id) && place.id !== currentId);
  const choices = newPlaces.length ? newPlaces : places.filter((place) => place.id !== currentId);
  const pool = choices.length ? choices : places;
  return pool.length ? pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] : null;
}

// Screen-space grouping keeps dense discovery usable without altering locations.
// Selected places always remain individual and are never swallowed by a group.
export function clusterProjectedPlaces(points, selectedId, cellSize = 120) {
  const groups = new Map();
  for (const point of points) {
    const key = point.place.id === selectedId ? `selected:${selectedId}` : `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(point);
  }
  const clustered = [...groups.values()].map((group) => ({ points: group, x: group.reduce((sum, point) => sum + point.x, 0) / group.length, y: group.reduce((sum, point) => sum + point.y, 0) / group.length }));
  // Adjacent grid cells can put two buttons on top of one another. Merge
  // nearby groups as well, retaining every member and the selected pin.
  let merged=true;
  while(merged){
    merged=false;
    outer: for(let i=0;i<clustered.length;i++)for(let j=i+1;j<clustered.length;j++){
      const a=clustered[i],b=clustered[j];
      if(a.points.some(p=>p.place.id===selectedId)||b.points.some(p=>p.place.id===selectedId))continue;
      if(Math.hypot(a.x-b.x,a.y-b.y)>=cellSize*.75)continue;
      const count=a.points.length+b.points.length;
      a.x=(a.x*a.points.length+b.x*b.points.length)/count;
      a.y=(a.y*a.points.length+b.y*b.points.length)/count;
      a.points.push(...b.points);clustered.splice(j,1);merged=true;break outer;
    }
  }
  return clustered;
}

// More specific presentation symbols; discovery mood groups stay unchanged.
export function placeIcon(category = "") {
  const value = category.toLowerCase();
  if (/museum/.test(value)) return "museum";
  if (/cinema|theatre|theater/.test(value)) return "film";
  if (/\bbar\b|\bpub\b|wine|nightclub|biergarten|brewery/.test(value)) return "bar";
  if (/restaurant|food|bakery/.test(value)) return "food";
  return placeKind(category);
}
