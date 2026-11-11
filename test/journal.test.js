import test from "node:test";
import assert from "node:assert/strict";
import {
  makeOuting,
  validateBackup,
  validateOuting,
  mergeOutings,
  localDate,
  validDate,
  backupPayload,
  safeUrl,
} from "../src/model.js";
const place = {
  id: "osm-node-1",
  name: "Museum",
  source: "OpenStreetMap",
  sourceUrl: "https://www.openstreetmap.org/node/1",
  lat: 40,
  lng: -80,
};
const entry = () => makeOuting(place);
test("a saved plan can become a dated memory and round-trip through backup", () => {
  const plan = entry();
  const memory = {
    ...plan,
    status: "visited",
    visitDate: localDate(),
    notes: "A day worth keeping.",
    photos: ["data:image/jpeg;base64,/9j/"],
  };
  const restored = validateBackup(
    JSON.parse(JSON.stringify(backupPayload({ outings: [memory] }))),
  );
  assert.deepEqual(restored, [validateOuting(memory)]);
});
test("merge is idempotent and preserves newer local edits plus unrelated outings", () => {
  const a = entry(),
    b = entry();
  const old = { ...a, updatedAt: "2020-01-01T00:00:00.000Z", notes: "old" };
  let result = mergeOutings([a], [old, b]);
  assert.equal(result.added, 1);
  assert.equal(result.updated, 0);
  assert.equal(result.outings[0].notes, a.notes);
  assert.deepEqual(
    mergeOutings(result.outings, [old, b]).outings,
    result.outings,
  );
});
test("a newer imported edit updates exactly its matching outing", () => {
  const a = entry(),
    b = entry();
  a.updatedAt = "2020-01-01T00:00:00.000Z";
  const incoming = {
    ...a,
    notes: "new",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
  const result = mergeOutings([a, b], [incoming]);
  assert.equal(result.updated, 1);
  assert.equal(result.outings.find((x) => x.id === a.id).notes, "new");
  assert.deepEqual(
    result.outings.find((x) => x.id === b.id),
    b,
  );
});
test("invalid, duplicate or oversized backup entries are rejected before merging", () => {
  const a = entry();
  assert.throws(() =>
    validateBackup({ app: "other", version: 1, outings: [] }),
  );
  assert.throws(() =>
    validateBackup({ app: "boredone", version: 2, outings: [] }),
  );
  assert.throws(() =>
    validateBackup({ app: "boredone", version: 1, outings: [a, a] }),
  );
  assert.throws(() =>
    validateOuting({
      ...a,
      photos: Array(25).fill("data:image/png;base64,AAAA"),
    }),
  );
  assert.throws(() =>
    validateOuting({ ...a, photos: ["data:image/svg+xml;base64,AAAA"] }),
  );
  assert.throws(() => validateOuting({ ...a, notes: "a".repeat(6001) }));
  assert.throws(() =>
    validateOuting({ ...a, place: { ...a.place, lat: NaN } }),
  );
});
test("date-only values remain calendar dates and memories cannot be in the future", () => {
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(validDate("2025-02-29"), false);
  assert.equal(validDate("2026-13-01"), false);
  assert.throws(() =>
    validateOuting({ ...entry(), status: "visited", visitDate: "2999-01-01" }),
  );
  assert.throws(() =>
    validateOuting({ ...entry(), status: "visited", visitDate: "" }),
  );
});
test("unsafe links are not rendered as active URLs", () => {
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl("data:text/html,evil"), "");
  assert.equal(safeUrl("https://example.com/"), "https://example.com/");
});

test("legacy memories and 24-photo albums round-trip without replacing visits",()=>{
 const old={...entry(),status:'visited',visitDate:localDate(),with:'Alex',photos:['data:image/png;base64,AAAA']};
 const newer={...old,id:'second-visit',photos:Array(24).fill('data:image/png;base64,AAAA')};
 const imported=validateBackup({app:'boredone',version:1,outings:[old,newer]});
 assert.equal(imported[0].photos.length,1);
 assert.equal(imported[1].photos.length,24);
 assert.equal(imported[0].with,'Alex');
 assert.equal(mergeOutings([old],imported).outings.length,2);
});
