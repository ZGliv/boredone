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
export function pageFromHash(hash = location.hash) {
  const value = hash.slice(1);
  return PAGES.includes(value) ? value : OLD[value] || "map";
}
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
