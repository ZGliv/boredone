import { localDate, MAX_BACKUP_BYTES } from "../model";

export const START_CITY = {
  name: "Pittsburgh",
  label: "Pittsburgh, Pennsylvania, US",
  lat: 40.44062,
  lng: -79.99589,
};
export const TABS = [
  ["find", "Find it"],
  ["plans", "Do it"],
  ["memories", "Remember"],
];
export function pageFromHash() {
  const value = location.hash.slice(1);
  return [...TABS.map((t) => t[0]), "settings"].includes(value)
    ? value
    : "find";
}
export function download(data,limit=MAX_BACKUP_BYTES) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  if (blob.size > limit)
    throw new Error(
      `This backup exceeds ${limit/1024/1024} MB. Your journal has not changed.`,
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
