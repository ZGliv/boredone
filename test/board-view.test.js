import test from "node:test";
import assert from "node:assert/strict";
import pack from "../data/city-packs/pittsburgh.json" with { type: "json" };
import { setProgress, boardProgress, ELSEWHERE } from "../src/cityBoard.js";
import { cityFromPack, placeStates } from "../src/city/cityPlaces.js";
import {
  boardSets, doneIdsFrom, setStanding, almostFinished, leftText, gridCells, gridLayout, CELL,
  splitPlaces, doneEffect, effectLines, verdictLabel, VERDICTS, byMonth, monthName, toggleName, hasName, factDate,
} from "../src/done/boardView.js";

const { board, places } = cityFromPack(pack, Date.parse("2026-11-12"));
const stamp = "2026-11-01T00:00:00.000Z";
// Visits recorded under other ids (as a guide or a save would), so matching runs by name.
const visit = (p, date, extra = {}) => ({ id: `v-${p.id}`, status: "visited", visitDate: date, createdAt: stamp, updatedAt: stamp, notes: "", with: "", rating: 0, photos: [],
  place: { id: `guide-${p.id}`, name: p.name, lat: p.lat, lng: p.lng, category: p.category }, ...extra });

// A set with exactly one place left once all but one are visited.
const sets = boardSets(board);
const target = sets.find((s) => s.rule === "all" && s.size === 4);
const outings = target.places.slice(0, 2).map((p, i) => visit(p, `2026-10-0${i + 1}`));
const states = placeStates(places, outings);
const doneIds = doneIdsFrom(states);

test("boardSets is generated once per board", () => {
  assert.equal(boardSets(board), sets);
  assert.ok(sets.length > 50);
  assert.deepEqual(boardSets(null), []);
});

test("setStanding agrees with cityBoard.setProgress for every set", () => {
  const extra = [...outings, ...sets[3].places.slice(0, 1).map((p) => visit(p, "2026-09-09")), ...sets[40].places.slice(0, 3).map((p) => visit(p, "2026-09-10"))];
  const ids = doneIdsFrom(placeStates(places, extra));
  for (const set of sets) {
    const engine = setProgress(set, extra, board);
    const mine = setStanding(set, ids);
    assert.equal(mine.done, Math.min(engine.done, engine.goal), set.name);
    assert.equal(mine.remaining, engine.remaining, set.name);
    assert.equal(mine.complete, engine.complete, set.name);
  }
  assert.equal(ids.size, boardProgress(board, extra).done);
});

test("almostFinished lists started, unfinished sets, closest first", () => {
  const rows = almostFinished(sets, doneIds, 10);
  assert.ok(rows.length >= 1);
  assert.ok(rows.every((r) => r.done > 0 && !r.complete));
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].remaining <= rows[i].remaining);
  assert.ok(rows.some((r) => r.id === target.id));
  assert.deepEqual(almostFinished(sets, new Set()), []);
});

test("leftText names what is left only when it is short", () => {
  const s = setStanding(target, doneIds);
  assert.equal(leftText(s), `2 left: ${s.left.map((p) => p.name).join(", ")}`);
  assert.equal(leftText({ ...s, left: s.left.slice(0, 1) }), `${s.left[0].name} left`);
  assert.equal(leftText({ ...s, left: [1, 2, 3, 4].map((n) => ({ name: `P${n}` })) }), "4 left");
  assert.equal(leftText({ ...s, rule: "any", remaining: 3 }), "3 more");
  assert.equal(leftText({ ...s, complete: true }), "Finished");
});

test("gridCells has one cell per place with the right counts", () => {
  const cells = gridCells(board, states);
  assert.equal(cells.length, board.total);
  assert.equal(cells.filter((c) => c === CELL.done).length, doneIds.size);
  const pileStates = new Map(states);
  pileStates.set(target.places[3].id, "saved");
  pileStates.set(places[0].id, "planned");
  assert.equal(gridCells(board, pileStates).filter((c) => c === CELL.pile).length, 2);
  assert.equal(gridCells(null, states).length, 0);
});

test("gridLayout fills the width and keeps the grid near the height", () => {
  for (const count of [1604, 5016]) {
    const g = gridLayout(count, 358, 360);
    assert.ok(g.width <= 358, `${count} fits width`);
    assert.ok(g.cols * g.rows >= count);
    assert.ok(g.cell >= 4);
    assert.ok(g.height < 360 * 1.6, `${count}: ${g.height}`);
  }
  assert.ok(gridLayout(1604, 358).pitch > gridLayout(5016, 358).pitch);
  assert.equal(gridLayout(0, 358).cols, 0);
});

test("splitPlaces sorts a group into done, on your pile and not yet", () => {
  const s = new Map(states);
  s.set(target.places[2].id, "saved");
  const split = splitPlaces(target.places, s);
  assert.equal(split.done.length, 2);
  assert.equal(split.pile.length, 1);
  assert.equal(split.rest.length, 1);
});

test("doneEffect states the real board effect of the next visit", () => {
  const third = target.places[2];
  const effect = doneEffect({ board, doneIds, place: { ...third, id: "elsewhere-id" }, visitDate: "2026-11-12" });
  assert.equal(effect.placeId, third.id);
  assert.equal(effect.isNew, true);
  assert.equal(effect.done, doneIds.size + 1);
  assert.equal(effect.total, board.total);
  // The new visit is counted in the result, never invented.
  const after = setProgress(target, [...outings, visit(third, "2026-11-12")], board);
  assert.equal(effect.set.id, target.id);
  assert.equal(effect.set.done, after.done);
  const lines = effectLines(effect);
  assert.equal(lines.head, `${target.name}, 3 of 4`);
  assert.equal(lines.tail, `${target.places[3].name} is the last one`);
  if (third.neighborhood !== ELSEWHERE) assert.equal(effect.hood.name, third.neighborhood);
});

test("doneEffect: a place already done, or not on the board", () => {
  const again = doneEffect({ board, doneIds, place: target.places[0], visitDate: "2026-11-12" });
  assert.equal(again.isNew, false);
  assert.equal(again.done, doneIds.size);
  assert.equal(effectLines(again), null);
  assert.equal(doneEffect({ board, doneIds, place: { id: "x", name: "Nowhere Bar", lat: 10, lng: 10 }, visitDate: "2026-11-12" }), null);
  assert.equal(doneEffect({ board, doneIds, place: { id: "you", name: "Typed by hand" }, visitDate: "2026-11-12" }), null);
  assert.equal(doneEffect({ board: null, doneIds, place: target.places[0] }), null);
});

test("verdicts keep older ratings' words", () => {
  assert.deepEqual(VERDICTS.map((v) => v.value), [5, 3, 1]);
  assert.equal(verdictLabel(5), "Loved it");
  assert.equal(verdictLabel(4), "Good");
  assert.equal(verdictLabel(0), "");
});

test("byMonth groups newest-first memories by month", () => {
  const m = (id, visitDate) => ({ id, visitDate });
  const groups = byMonth([m("a", "2026-11-10"), m("b", "2026-11-02"), m("c", "2026-10-30"), m("d", "2025-11-01")]);
  assert.deepEqual(groups.map((g) => [g.month, g.items.length]), [["2026-11", 2], ["2026-10", 1], ["2025-11", 1]]);
  const now = new Date("2026-11-12T12:00:00");
  assert.equal(monthName("2026-11", now), "November");
  assert.equal(monthName("2025-11", now), "November 2025");
  assert.equal(factDate("2026-11-03", now), "3 Nov");
  assert.equal(factDate("2025-11-03", now), "3 Nov 2025");
});

test("toggleName adds and removes companions in the stored text", () => {
  assert.equal(toggleName("", "Sam"), "Sam");
  assert.equal(toggleName("Sam", "Alex"), "Sam, Alex");
  assert.equal(toggleName("Sam, Alex", "sam"), "Alex");
  assert.equal(hasName("Sam, Alex", "alex"), true);
  assert.equal(hasName("", "Sam"), false);
});
