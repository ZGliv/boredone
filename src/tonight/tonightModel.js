// What the map's Tonight panel needs from the engines, as plain functions.
// Pure: no React, no storage, no clock unless one is passed in.
import { sameVenue } from "../cityBoard.js";
import { placeForOuting } from "../city/cityPlaces.js";
import { distanceText, placeLine } from "../city/placeText.js";
import { distance } from "../recommendations.js";
import { makeOuting, validateOuting } from "../model.js";
import { saveToPlan } from "../saves.js";
import { normalizeKind } from "../venues.js";

const RESET_HOURS = 5;

// The dials decideTonight reads (context.companions, context.energy). The
// labels are ours; the values are the engine's.
export const COMPANY = [
  { value: "solo", label: "Just me" },
  { value: "date", label: "Two of us" },
  { value: "friends", label: "Group" },
];
export const ENERGY = [
  { value: "low", label: "Low-key" },
  { value: "high", label: "Up for it" },
];

const pad = (n) => String(n).padStart(2, "0");
// "2026-11-13T18:10:00-05:00": a local wall-clock time with its offset.
export function isoWithOffset(date) {
  const off = -date.getTimezoneOffset(), sign = off < 0 ? "-" : "+", abs = Math.abs(off);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
// Tonight ends at 5 am: later today when it is past midnight, else tomorrow.
export function tonightEnd(now) {
  const end = new Date(now);
  if (now.getHours() >= RESET_HOURS) end.setDate(end.getDate() + 1);
  end.setHours(RESET_HOURS, 0, 0, 0);
  return end;
}
// The calendar day a plan made now belongs to: before 5 am it is still last night.
export function sessionDate(now) {
  const day = new Date(now.getTime() - RESET_HOURS * 3600000);
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

export function tonightContext({ now, location = null, companions = null, energy = null }) {
  return {
    now: isoWithOffset(now),
    ...(location ? { location: { lat: location.lat, lng: location.lng } } : {}),
    ...(companions ? { companions } : {}),
    ...(energy ? { energy } : {}),
  };
}

// Query string for GET /api/events: around you, else the city's centre, until 5 am.
export function eventsQuery({ center, radiusKm = 10, now }) {
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return "";
  const radius = Math.min(50, Math.max(0.5, Number(radiusKm) || 10));
  return new URLSearchParams({
    lat: center.lat.toFixed(3), lng: center.lng.toFixed(3), radiusKm: String(radius),
    from: isoWithOffset(now), to: isoWithOffset(tonightEnd(now)),
  }).toString();
}
// Events arrive without a venue id; pair each with a city place only when the
// venue name and position agree (the board's own sameVenue rule).
export function linkEvents(events, places) {
  return (Array.isArray(events) ? events : []).filter((e) => e && e.id && e.start).map((event) => {
    if (event.placeId || !event.venueName || !Number.isFinite(event.lat) || !Number.isFinite(event.lng)) return event;
    const hit = sameVenue({ name: event.venueName, lat: event.lat, lng: event.lng }, places);
    return hit ? { ...event, placeId: hit.place.id } : event;
  });
}

// decideTonight's "Coffee shop in Lawrenceville" fallback, to drop it when the
// kind line already says the same thing.
function engineKindText(place) {
  const kind = normalizeKind(place?.category).replace(/_/g, " ");
  if (!kind) return "";
  const hood = typeof place.neighborhood === "string" ? place.neighborhood.trim() : "";
  return `${kind[0].toUpperCase()}${kind.slice(1)}${hood ? ` in ${hood}` : ""}`;
}

const spotOf = (pick) => {
  const e = pick.event;
  if (e && Number.isFinite(e.lat) && Number.isFinite(e.lng)) return e;
  const p = pick.place || pick.save?.place;
  return p && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? p : null;
};

// The saves Tonight may pick from: only ones with a real place in this city,
// its place one of the city's or within `reach` km of `center`. A note with
// no place yet stays on the Pile; it is never one of tonight's three.
export function tonightSaves(saves, { places = [], placeById = new Map(), center = null, reach = Infinity } = {}) {
  return (saves || []).filter((save) => save?.place && (placeForOuting(save, places, placeById)
    || (center && Number.isFinite(save.place.lat) && Number.isFinite(save.place.lng) && distance(center, save.place) <= reach)));
}

// One pick as the screen shows it. Reasons are decide's own words; the
// distance moves to its own column and the kind line is not repeated.
// placeOf(place) returns the city's record for a place a save or plan kept
// from an older guide, so the line under the name matches the map sheet.
export function pickView(pick, { location = null, placeOf = null } = {}) {
  const own = pick.place || pick.save?.place || null;
  const place = (own && placeOf?.(own)) || own;
  const event = pick.event || null;
  const save = pick.save || null;
  const title = event?.title || place?.name || "";
  const line = event ? (place ? place.name : event.venueName || "") : place ? placeLine(place) : "";
  const spot = spotOf(pick);
  const km = location && spot ? distance(location, spot) : null;
  const kindLine = place ? engineKindText(place).toLowerCase() : "";
  const reasons = (pick.reasons || [])
    .filter((r) => !/ away$/.test(r))
    .filter((r) => !kindLine || r.toLowerCase() !== kindLine)
    .filter((r) => !(event && r === `At ${event.venueName}`))
    // "Guide entry updated 2024-12-22" is bookkeeping about the old guide, not a reason to go.
    .filter((r) => !/^Guide entry updated/.test(r))
    .map((text) => ({ text, tone: /^Saved|^Already in your plans|^At a place you saved/.test(text) ? "blue" : "" }));
  return { id: pick.id, kind: pick.kind, title, line, km, distance: km == null ? "" : distanceText(km), reasons, place, event, save, spot };
}

// The plan already standing for this pick's venue, if any. A plan saved
// from an older guide keeps that guide's place id, so plans are matched to
// the pick's place the way the map's states are (placeForOuting: same id,
// else sameVenue). `places`/`placeById` are the city's places.
export function planFor(pick, outings, { places = [], placeById = new Map() } = {}) {
  const plans = outings.filter((o) => o?.status === "planned");
  if (pick.save) {
    const own = plans.find((o) => o.id === pick.save.id);
    if (own) return own;
  }
  const place = pick.place || pick.save?.place || null;
  if (place?.id) {
    return plans.find((o) => o.place?.id === place.id)
      || plans.find((o) => o.place && placeForOuting(o, places, placeById)?.id === place.id)
      || null;
  }
  if (pick.event) return plans.find((o) => o.place?.id === `event-${pick.event.id}`) || null;
  return null;
}

// The day a pick is for: a save dated later this week is for that day, not
// tonight. Everything else is tonight's session day.
export function pickDay(pick, now = new Date()) {
  const today = sessionDate(now), day = pick.save?.source?.eventDate || "";
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day > today ? day : today;
}

// "Go": the outing to write so the pick sits in the plan for its day
// (pickDay). A plan already standing for the venue is re-dated, never
// duplicated; a save turns into its plan (keeping its source); a place or
// event becomes a new plan. Tonight's picks are a snapshot, so a save is
// re-read from `outings`: null when it is gone, already done, or has no place
// to go to yet.
export function planFromPick(pick, { outings = [], now = new Date(), places = [], placeById = new Map() } = {}) {
  const day = pickDay(pick, now), stamp = now.toISOString();
  const live = pick.save ? outings.find((o) => o?.id === pick.save.id) : null;
  if (pick.save && (!live || !["saved", "planned"].includes(live.status))) return null;
  const standing = planFor(live ? { ...pick, save: live } : pick, outings, { places, placeById });
  if (standing) return standing.planDate === day ? standing : validateOuting({ ...standing, planDate: day, updatedAt: stamp });
  if (live) return live.place ? saveToPlan(live, day, now) : null;
  if (pick.event) {
    const e = pick.event;
    const located = Number.isFinite(e.lat) && Number.isFinite(e.lng);
    const place = pick.place || { id: `event-${e.id}`, name: (e.venueName || e.title).slice(0, 180), ...(located ? { lat: e.lat, lng: e.lng } : {}), address: "", category: "", website: e.url || "" };
    return validateOuting({ ...makeOuting(place), planDate: day, notes: e.title.slice(0, 6000), createdAt: stamp, updatedAt: stamp });
  }
  if (!pick.place) return null;
  return validateOuting({ ...makeOuting(pick.place), planDate: day, createdAt: stamp, updatedAt: stamp });
}

// The finishable set you are closest to finishing. Only sets you have
// started: an untouched set is not "close". `states` is the map's place-state
// map, so the count agrees with the Board.
export function closestSet(sets, states) {
  let best = null;
  for (const set of sets || []) {
    const done = set.members.filter((id) => states.get(id) === "done").length;
    const remaining = set.goal - done;
    if (!done || remaining <= 0) continue;
    const row = { id: set.id, name: set.name, done: Math.min(done, set.goal), goal: set.goal, remaining };
    if (!best || remaining < best.remaining || (remaining === best.remaining && (row.done / row.goal > best.done / best.goal || (row.done / row.goal === best.done / best.goal && row.name < best.name)))) best = row;
  }
  return best;
}

// The save on your pile that points at this place, newest first.
export function saveForPlace(place, saves, places, placeById) {
  if (!place) return null;
  return saves.find((save) => save.place && placeForOuting(save, places, placeById)?.id === place.id) || null;
}
