// The city packs that exist (data/city-packs). Each loads as its own chunk, so
// the first paint never waits for a megabyte of places.
export const CITY_PACKS = [
  { id: "pittsburgh", name: "Pittsburgh", load: () => import("../../data/city-packs/pittsburgh.json") },
  { id: "pittsburgh-metro", name: "Pittsburgh metro", load: () => import("../../data/city-packs/pittsburgh-metro.json") },
  { id: "columbus", name: "Columbus", load: () => import("../../data/city-packs/columbus.json") },
];
export const DEFAULT_CITY = "pittsburgh";
export const packById = (id) => CITY_PACKS.find((pack) => pack.id === id) || null;
