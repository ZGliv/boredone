// The city packs that exist (data/city-packs). Each loads as its own chunk, so
// the first paint never waits for a megabyte of places. center is the pack's
// own (test/shell-data.test.js keeps them equal), so the map can start flying
// to a city before its places arrive.
export const CITY_PACKS = [
  { id: "pittsburgh", name: "Pittsburgh", center: { lat: 40.44, lng: -80 }, load: () => import("../../data/city-packs/pittsburgh.json") },
  { id: "pittsburgh-metro", name: "Pittsburgh metro", center: { lat: 40.44, lng: -80 }, load: () => import("../../data/city-packs/pittsburgh-metro.json") },
  { id: "columbus", name: "Columbus", center: { lat: 39.9612, lng: -82.9988 }, load: () => import("../../data/city-packs/columbus.json") },
];
export const DEFAULT_CITY = "pittsburgh";
export const packById = (id) => CITY_PACKS.find((pack) => pack.id === id) || null;
