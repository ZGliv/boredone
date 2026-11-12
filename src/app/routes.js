import { localDate, MAX_BACKUP_BYTES } from "../model.js";

// The four tabs, then pages reached from inside them. Old links still land.
export const TABS = [
  ["map", "Map", "map"],
  ["pile", "Pile", "pile"],
  ["board", "Board", "board"],
  ["journal", "Journal", "journal"],
];
export const PAGES = [...TABS.map((tab) => tab[0]), "settings"];
const OLD = { find: "map", plans: "journal", memories: "journal" };
// "#pile/<id>" lands on the Pile with <id> as its target (a place on the Map,
// a save on the Pile).
export function pageFromHash(hash = location.hash) {
  const value = hash.slice(1).split("/")[0];
  return PAGES.includes(value) ? value : OLD[value] || "map";
}
export function hashTarget(hash = location.hash) {
  const [, id = ""] = hash.slice(1).split(/\/(.*)/s);
  try { return decodeURIComponent(id); } catch { return ""; }
}
export const targetHash = (page, id) => `${page}/${encodeURIComponent(id)}`;
export function download(data,limit=MAX_BACKUP_BYTES) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  if (blob.size > limit)
    throw new Error(
      `Backup is over ${limit/1024/1024} MB. Nothing changed.`,
    );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `boredone-backup-${localDate()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function directions(place) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.lat != null ? `${place.lat},${place.lng}` : place.name + " " + place.address)}`;
}
