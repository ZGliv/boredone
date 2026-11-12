import { displayDate, localDate } from "../model.js";
import { outingLabel } from "../saves.js";

// Pure helpers shared by the journal pages. No React, no storage.
export function sortPlans(outings) {
  return outings
    .filter((o) => o.status === "planned")
    .sort(
      (a, b) =>
        (a.planDate || "9999").localeCompare(b.planDate || "9999") ||
        b.createdAt.localeCompare(a.createdAt),
    );
}
export function sortMemories(outings) {
  return outings
    .filter((o) => o.status === "visited")
    .sort(
      (a, b) =>
        b.visitDate.localeCompare(a.visitDate) ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
}
export function searchOutings(outings, query) {
  return outings.filter((o) =>
    `${outingLabel(o)} ${o.place?.category || ""} ${o.place?.address || ""} ${o.notes} ${o.with} ${o.visitDate} ${displayDate(o.visitDate)}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
}
export function manualOuting(memory = false) {
  const stamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    place: {
      id: "manual-" + crypto.randomUUID(),
      name: "",
      address: "",
      category: "",
      source: "You",
      sourceUrl: "",
      website: "",
      hours: "",
      fee: "",
      access: "",
    },
    status: memory ? "visited" : "planned",
    planDate: "",
    visitDate: memory ? localDate() : "",
    notes: "",
    with: "",
    rating: 0,
    photos: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
}
