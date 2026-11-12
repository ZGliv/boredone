// What the Board, the Done sheet and the Journal show, derived from the city
// board and the journal. Pure: no React, no storage, no clock.
//
// "Done" ids come from the app's `states` map (cityPlaces.placeStates), which
// matches visits exactly the way cityBoard does, so one set of done ids serves
// every set, neighbourhood and grid cell without re-matching per set.
import { ELSEWHERE, generateSets, matchVisits } from "../cityBoard.js";

const setCache = new WeakMap();
// generateSets once per board edition.
export function boardSets(board) {
  if (!board) return [];
  if (!setCache.has(board)) setCache.set(board, generateSets(board));
  return setCache.get(board);
}

export function doneIdsFrom(states) {
  const ids = new Set();
  if (states) for (const [id, state] of states) if (state === "done") ids.add(id);
  return ids;
}

// The same figures as cityBoard.setProgress, from a set of done ids, plus the
// places still to go.
export function setStanding(set, doneIds) {
  const done = set.members.filter((id) => doneIds.has(id)).length;
  return {
    id: set.id,
    name: set.name,
    rule: set.rule,
    done: Math.min(done, set.goal),
    goal: set.goal,
    size: set.size,
    remaining: Math.max(0, set.goal - done),
    complete: done >= set.goal,
    left: set.places.filter((p) => !doneIds.has(p.id)),
  };
}

// Started, unfinished sets, closest to finished first.
export function almostFinished(sets, doneIds, limit = 4) {
  return sets
    .map((set) => setStanding(set, doneIds))
    .filter((s) => s.done > 0 && !s.complete)
    .sort((a, b) => a.remaining - b.remaining || b.done / b.goal - a.done / a.goal || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// "2 left: Gooskis, Pope's Place" / "Pope's Place left" / "3 more" / "9 left".
export function leftText(standing, names = 3) {
  if (standing.complete) return "Finished";
  if (standing.rule === "any") return `${standing.remaining} more`;
  const left = standing.left.map((p) => p.name);
  if (left.length === 1) return `${left[0]} left`;
  if (left.length <= names) return `${left.length} left: ${left.join(", ")}`;
  return `${left.length} left`;
}

export const CELL = { rest: 0, pile: 1, done: 2 };
const cellOf = (state) => (state === "done" ? CELL.done : state === "saved" || state === "planned" ? CELL.pile : CELL.rest);

// One cell per board place, grouped by neighbourhood (most done first, then
// largest; Elsewhere last), done first inside each so progress reads as
// solid runs from the top-left.
export function gridCells(board, states) {
  if (!board) return new Uint8Array(0);
  const hoods = new Map();
  for (const place of board.places) {
    if (!hoods.has(place.neighborhood)) hoods.set(place.neighborhood, []);
    hoods.get(place.neighborhood).push(cellOf(states?.get(place.id)));
  }
  const done = (list) => list.filter((c) => c === CELL.done).length;
  const order = [...hoods].sort(([a, x], [b, y]) => (a === ELSEWHERE) - (b === ELSEWHERE) || done(y) - done(x) || y.length - x.length || a.localeCompare(b));
  const cells = new Uint8Array(board.places.length);
  let i = 0;
  for (const [, list] of order) for (const cell of list.sort((a, b) => b - a)) cells[i++] = cell;
  return cells;
}

// Square cells that fill `width` and keep the grid near `height`: 1,600
// places get roomy cells, 5,000 get small ones. Pitch is cell plus gap.
export function gridLayout(count, width, height = 360, { min = 5, max = 11 } = {}) {
  if (!count || width <= 0) return { cols: 0, rows: 0, pitch: 0, cell: 0, width: 0, height: 0 };
  const ideal = Math.sqrt((width * height) / count);
  const pitch = Math.max(min, Math.min(max, Math.floor(ideal * 2) / 2));
  const cols = Math.max(1, Math.floor(width / pitch));
  const rows = Math.ceil(count / cols);
  const gap = pitch >= 8 ? 2 : 1;
  return { cols, rows, pitch, cell: pitch - gap, width: cols * pitch - gap, height: rows * pitch - gap };
}

// Places in a group, split by where you stand with them.
export function splitPlaces(places, states) {
  const out = { done: [], pile: [], rest: [] };
  for (const place of places) {
    const cell = cellOf(states?.get(place.id));
    (cell === CELL.done ? out.done : cell === CELL.pile ? out.pile : out.rest).push(place);
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// What marking `place` done on `visitDate` would change on the board.
// null when the place is not on this board. Never invents a set: only sets
// that contain the credited place are considered.
export function doneEffect({ board, doneIds, place, visitDate }) {
  if (!board || !place) return null;
  const visit = { id: "preview", status: "visited", visitDate, place };
  const [hit] = matchVisits(board.places, [visit]).keys();
  if (!hit) return null;
  const onBoard = board.places[board.placeIndex[hit]];
  const isNew = !doneIds.has(hit);
  const after = new Set(doneIds);
  after.add(hit);
  const hoodPlaces = onBoard.neighborhood === ELSEWHERE ? [] : board.places.filter((p) => p.neighborhood === onBoard.neighborhood);
  const hood = hoodPlaces.length ? { name: onBoard.neighborhood, done: hoodPlaces.filter((p) => after.has(p.id)).length, total: hoodPlaces.length } : null;
  let set = null;
  if (isNew) {
    const touched = boardSets(board)
      .filter((s) => s.members.includes(hit))
      .map((s) => ({ before: setStanding(s, doneIds), after: setStanding(s, after) }))
      .filter((s) => s.after.done > s.before.done)
      .sort((a, b) => b.after.complete - a.after.complete || (a.after.rule === "all" ? 0 : 1) - (b.after.rule === "all" ? 0 : 1) || a.after.remaining - b.after.remaining || a.after.size - b.after.size || a.after.name.localeCompare(b.after.name));
    set = touched[0]?.after || null;
  }
  return { placeId: hit, name: onBoard.name, isNew, done: after.size, before: doneIds.size, total: board.total, hood, set };
}

// "Polish Hill bars, 3 of 4" and the line under it.
export function effectLines(effect) {
  if (!effect?.isNew) return null;
  const { set, hood } = effect;
  if (set) {
    const name = set.name, tally = `${set.done} of ${set.goal}`, head = `${name}, ${tally}`;
    if (set.complete) return { head, name, tally, tail: "Finished" };
    if (set.rule === "all" && set.left.length === 1) return { head, name, tally, tail: `${set.left[0].name} is the last one` };
    return { head, name, tally, tail: leftText(set) };
  }
  if (hood) return { head: `${hood.name}, ${hood.done} of ${hood.total}`, name: hood.name, tally: `${hood.done} of ${hood.total}`, tail: hood.done === 1 ? `First in ${hood.name}` : "" };
  return null;
}

// Rating stored as 1-5. The Done sheet offers three; older records may hold
// 4 or 2 and keep their own word.
export const VERDICTS = [
  { value: 5, label: "Loved it" },
  { value: 3, label: "It was fine" },
  { value: 1, label: "Not again" },
];
const WORDS = { 5: "Loved it", 4: "Good", 3: "It was fine", 2: "Meh", 1: "Not again" };
export const verdictLabel = (rating) => WORDS[rating] || "";

// "2026-11" -> "November 2026"; groups are newest first as given.
export function byMonth(memories) {
  const groups = [];
  for (const memory of memories) {
    const key = memory.visitDate.slice(0, 7);
    if (groups.at(-1)?.month !== key) groups.push({ month: key, items: [] });
    groups.at(-1).items.push(memory);
  }
  return groups;
}
export function monthName(month, now = new Date()) {
  const date = new Date(`${month}-01T12:00:00`);
  return date.toLocaleDateString("en-US", date.getFullYear() === now.getFullYear() ? { month: "long" } : { month: "long", year: "numeric" });
}
// "Fri 13 Nov" for journal rows; "Friday 13 November" for the Done sheet.
export function shortDay(value) {
  if (!value) return "";
  const d = new Date(`${value}T12:00:00`);
  return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.getDate()} ${d.toLocaleDateString("en-US", { month: "short" })}`;
}
export function longDay(value) {
  if (!value) return "";
  const d = new Date(`${value}T12:00:00`);
  return `${d.toLocaleDateString("en-US", { weekday: "long" })} ${d.getDate()} ${d.toLocaleDateString("en-US", { month: "long" })}`;
}
export function factDate(value, now = new Date()) {
  if (!value) return "";
  const d = new Date(`${value}T12:00:00`);
  const base = `${d.getDate()} ${d.toLocaleDateString("en-US", { month: "short" })}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

// Companions are stored comma-separated in `with`.
export function toggleName(value, name) {
  const list = (value || "").split(",").map((s) => s.trim()).filter(Boolean);
  const i = list.findIndex((n) => n.toLowerCase() === name.toLowerCase());
  if (i >= 0) list.splice(i, 1);
  else list.push(name.trim());
  return list.join(", ");
}
export const hasName = (value, name) => (value || "").split(",").some((s) => s.trim().toLowerCase() === name.toLowerCase());
