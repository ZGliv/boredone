export const VERSION = 1;
export const MAX_OUTINGS = 500;
// Saves (the Pile) are photo-free pointers of about 1 KB each, so they get their
// own budget instead of crowding out plans and memories, whose photos are what
// the 500 limit and the 50 MB backup ceiling actually protect.
export const MAX_SAVES = 1000;
export const MAX_RECORDS = MAX_OUTINGS + MAX_SAVES;
export const SAVE_APPS = ["instagram", "tiktok", "youtube", "google-maps", "web", "note"];
export const STATUSES = ["saved", "planned", "visited"];
export const MAX_PHOTOS = 24;
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
export function blankLibrary() {
  return { version: VERSION, revision: 0, outings: [] };
}
export function text(value, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
export function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T12:00:00");
  return !isNaN(d) && localDate(d) === value;
}
export function displayDate(value) {
  if (!value) return "Whenever you feel like it";
  return new Date(value + "T12:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function field(value, name, max, optional = false) {
  if (optional && (value === undefined || value === "")) return "";
  if (
    typeof value !== "string" ||
    (!optional && !value.trim()) ||
    value.length > max
  )
    throw new Error(`Invalid ${name} in backup.`);
  return value;
}
export function validatePlace(place) {
  if (!place || typeof place !== "object")
    throw new Error("Missing place in backup.");
  const p = {
    id: field(place.id, "place ID", 160),
    name: field(place.name, "place name", 180),
    address: field(place.address, "address", 600, true),
    category: field(place.category, "category", 100, true),
    source: field(place.source, "source", 100, true),
    sourceUrl: safeUrl(place.sourceUrl),
    website: safeUrl(place.website),
    hours: field(place.hours, "hours", 400, true),
    fee: field(place.fee, "price", 100, true),
    access: field(place.access, "access", 40, true),
  };
  if (place.lat !== undefined && place.lat !== null) {
    if (
      typeof place.lat !== "number" ||
      !Number.isFinite(place.lat) ||
      Math.abs(place.lat) > 90 ||
      typeof place.lng !== "number" ||
      !Number.isFinite(place.lng) ||
      Math.abs(place.lng) > 180
    )
      throw new Error("Invalid place coordinates.");
    p.lat = place.lat;
    p.lng = place.lng;
  }
  return p;
}
export function validateSource(source) {
  if (!source || typeof source !== "object" || Array.isArray(source))
    throw new Error("Invalid save source.");
  const url = field(source.url, "saved link", 2048, true);
  const s = {
    url: url ? safeUrl(url) : "",
    app: source.app,
    text: field(source.text, "saved text", 2000, true),
    savedAt: field(source.savedAt, "save time", 40),
    eventDate: field(source.eventDate, "event date", 10, true),
    expiresAt: field(source.expiresAt, "end date", 10, true),
  };
  if (url && (!s.url || s.url.length > 2048))
    throw new Error("Invalid saved link.");
  if (!SAVE_APPS.includes(s.app)) throw new Error("Invalid save source.");
  if (!Number.isFinite(Date.parse(s.savedAt)))
    throw new Error("Invalid save time.");
  if ((s.eventDate && !validDate(s.eventDate)) || (s.expiresAt && !validDate(s.expiresAt)))
    throw new Error("Invalid save date.");
  return s;
}
export function validateOuting(outing,{preserveCalendarDate=false}={}) {
  if (!outing || typeof outing !== "object") throw new Error("Invalid outing.");
  // Only a save may be unresolved (no venue yet); plans and memories need one.
  const unresolved = outing.status === "saved" && outing.place === null;
  const x = {
    id: field(outing.id, "outing ID", 100),
    place: unresolved ? null : validatePlace(outing.place),
    status: outing.status,
    planDate: outing.planDate || "",
    visitDate: outing.visitDate || "",
    notes: field(outing.notes, "notes", 6000, true),
    with: field(outing.with, "companions", 200, true),
    rating: outing.rating ?? 0,
    createdAt: field(outing.createdAt, "creation time", 40),
    updatedAt: field(outing.updatedAt, "update time", 40),
    photos: [],
  };
  if (!STATUSES.includes(x.status))
    throw new Error("Invalid outing status.");
  // Older records and backups have no source; keep them byte-identical so they
  // neither re-sync nor need the newer database function.
  if (outing.source !== undefined && outing.source !== null)
    x.source = validateSource(outing.source);
  if (unresolved && !x.source)
    throw new Error("A save needs a link, a note or a place.");
  if (
    !Number.isFinite(Date.parse(x.createdAt)) ||
    !Number.isFinite(Date.parse(x.updatedAt))
  )
    throw new Error("Invalid backup timestamps.");
  if (
    (x.planDate && !validDate(x.planDate)) ||
    (x.visitDate && !validDate(x.visitDate)) ||
    (x.status === "visited" && !x.visitDate) ||
    (x.status === "saved" && x.visitDate)
  )
    throw new Error("Invalid outing date.");
  if (!preserveCalendarDate && x.visitDate > localDate())
    throw new Error("A memory cannot have a future date.");
  if (!Number.isInteger(x.rating) || x.rating < 0 || x.rating > 5)
    throw new Error("Invalid memory rating.");
  if (!Array.isArray(outing.photos) || outing.photos.length > MAX_PHOTOS)
    throw new Error("Too many photos in an outing.");
  x.photos = outing.photos.map((photo) => {
    if (
      typeof photo !== "string" ||
      photo.length > 1400000 ||
      !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(photo)
    )
      throw new Error("A photo is invalid or too large.");
    return photo;
  });
  return x;
}
export const isSave = (outing) => outing?.status === "saved";
export function checkCapacity(outings) {
  const saves = outings.filter(isSave).length;
  if (outings.length - saves > MAX_OUTINGS)
    throw new Error(
      "Your journal supports 500 plans and memories. Export a backup before making space.",
    );
  if (saves > MAX_SAVES)
    throw new Error(
      "Your saved pile holds up to 1,000 saves. Clear a few before adding more.",
    );
  return outings;
}
export function validateBackup(value) {
  if (
    value?.app !== "boredone" ||
    value.version !== VERSION ||
    !Array.isArray(value.outings) ||
    value.outings.length > MAX_RECORDS
  )
    throw new Error(
      "Choose a Boredone backup file (version 1, up to 500 plans and memories plus 1,000 saves).",
    );
  const ids = new Set();
  const outings = value.outings.map(validateOuting);
  for (const item of outings) {
    if (ids.has(item.id))
      throw new Error("The backup contains duplicate outing IDs.");
    ids.add(item.id);
  }
  return checkCapacity(outings);
}
export function mergeOutings(current, incoming) {
  const combined = new Map(current.map((o) => [o.id, o]));
  let added = 0,
    updated = 0;
  for (const row of incoming) {
    const prior = combined.get(row.id);
    if (!prior) {
      combined.set(row.id, row);
      added++;
    } else if (Date.parse(row.updatedAt) > Date.parse(prior.updatedAt)) {
      combined.set(row.id, row);
      updated++;
    }
  }
  checkCapacity([...combined.values()]);
  return { outings: [...combined.values()], added, updated };
}
export function makeOuting(place) {
  const stamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    place: validatePlace(place),
    status: "planned",
    planDate: "",
    visitDate: "",
    notes: "",
    with: "",
    rating: 0,
    photos: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
}
export function backupPayload(library) {
  return {
    app: "boredone",
    version: VERSION,
    exportedAt: new Date().toISOString(),
    outings: library.outings,
  };
}
