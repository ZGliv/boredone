import test from "node:test";
import assert from "node:assert/strict";
import { sortPlans, sortMemories, searchOutings, manualOuting } from "../src/app/outings.js";
import { validateOuting } from "../src/model.js";

const outing = (id, fields) => ({
  id, status: "planned", planDate: "", visitDate: "", notes: "", with: "", rating: 0, photos: [],
  createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z",
  place: { id: "p-" + id, name: id, category: "", address: "" }, ...fields,
});

test("plans sort by plan date, undated last, then newest first", () => {
  const list = [
    outing("undated-old", {}),
    outing("later", { planDate: "2026-12-05" }),
    outing("undated-new", { createdAt: "2026-11-05T00:00:00.000Z" }),
    outing("sooner", { planDate: "2026-11-20" }),
    outing("memory", { status: "visited", visitDate: "2026-11-02" }),
  ];
  assert.deepEqual(sortPlans(list).map((o) => o.id), ["sooner", "later", "undated-new", "undated-old"]);
});

test("memories sort newest visit first, then latest edit", () => {
  const list = [
    outing("old", { status: "visited", visitDate: "2026-10-01" }),
    outing("same-day-edited", { status: "visited", visitDate: "2026-11-02", updatedAt: "2026-11-03T00:00:00.000Z" }),
    outing("same-day", { status: "visited", visitDate: "2026-11-02" }),
    outing("plan", {}),
  ];
  assert.deepEqual(sortMemories(list).map((o) => o.id), ["same-day-edited", "same-day", "old"]);
});

test("search matches place, people and notes, ignoring case", () => {
  const list = [
    outing("Kura", { with: "Sam", notes: "Conveyor sushi" }),
    outing("Heinz Hall", { place: { id: "h", name: "Heinz Hall", category: "theatre", address: "Penn Ave" } }),
  ];
  assert.deepEqual(searchOutings(list, "sam").map((o) => o.id), ["Kura"]);
  assert.deepEqual(searchOutings(list, "PENN").map((o) => o.id), ["Heinz Hall"]);
  assert.deepEqual(searchOutings(list, "").length, 2);
});

test("a manual outing is a valid blank plan or today's memory", () => {
  const plan = manualOuting();
  assert.equal(plan.status, "planned");
  assert.equal(plan.visitDate, "");
  assert.equal(plan.place.source, "You");
  assert.notEqual(plan.id, manualOuting().id);
  const memory = manualOuting(true);
  assert.equal(memory.status, "visited");
  assert.match(memory.visitDate, /^\d{4}-\d{2}-\d{2}$/);
  // A named manual memory passes the same validation the editor applies.
  assert.doesNotThrow(() => validateOuting({ ...memory, place: { ...memory.place, name: "Picnic" } }));
});
