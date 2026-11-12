import test from "node:test";
import assert from "node:assert/strict";
import { journalPlaces, pinStatus } from "../src/exploration.js";

const visit = (id, date, name = "Park") => ({ status: "visited", place: { id, name }, visitDate: date, updatedAt: date });
test("a map has one pin per place using the latest visit without mutating the journal", () => {
  const rows = [visit("park", "2025-01-01", "Old name"), visit("park", "2026-01-01"), visit("cafe", "2026-02-01", "Cafe")];
  const original = structuredClone(rows);
  assert.deepEqual(journalPlaces(rows, "visited").map((p) => p.name), ["Cafe", "Park"]);
  assert.deepEqual(rows, original);
});
test("plans and memories remain separate, including places without coordinates", () => {
  const rows = [visit("park", "2026-01-01"), { ...visit("park", "2026-01-02"), status: "planned" }];
  assert.equal(journalPlaces(rows, "planned").length, 1);
  assert.equal(journalPlaces(rows, "visited").length, 1);
  assert.equal(pinStatus("park", rows), "planned");
  assert.equal(pinStatus("park", rows.slice(0, 1)), "visited");
  assert.equal(pinStatus("unknown", rows), "discovered");
});

import { placeKind, collectionStamps, chooseUnvisited, clusterProjectedPlaces } from "../src/exploration.js";
import { worldStyle } from "../src/worldStyle.js";

test("field stamps reflect unique visited places, never plans or repeated visits", () => {
  const rows = [visit("cafe", "2026-01-01"), visit("cafe", "2026-02-01"), { ...visit("park", "2026-01-01"), status: "planned" }];
  rows[0].place.category = "Coffee shop";
  rows[1].place.category = "Coffee shop";
  assert.equal(collectionStamps(rows).find((stamp) => stamp.id === "cafe").count, 1);
  assert.equal(collectionStamps(rows).find((stamp) => stamp.id === "garden").count, 0);
  assert.equal(placeKind("Museum"), "gallery");
  assert.equal(placeKind("Arcade"), "play");
});
test("pick for me prefers an unvisited alternative and handles empty/single lists", () => {
  const places = [{ id: "seen" }, { id: "current" }, { id: "new" }];
  assert.equal(chooseUnvisited(places, [visit("seen", "2026-01-01")], "current", () => 0).id, "new");
  assert.equal(chooseUnvisited([], [], null), null);
  assert.equal(chooseUnvisited([places[0]], [], "seen").id, "seen");
});
test("120 dense points group without losing records and selected point stays individual", () => {
  const points = Array.from({ length: 120 }, (_, i) => ({ place: { id: String(i) }, x: 40 + i % 10 * 20, y: 100 + Math.floor(i / 10) * 15 }));
  const grouped = clusterProjectedPlaces(points, "55");
  assert.ok(grouped.length < 15);
  assert.equal(grouped.reduce((sum, group) => sum + group.points.length, 0), 120);
  assert.equal(grouped.find((group) => group.points.some((point) => point.place.id === "55")).points.length, 1);
  assert.equal(new Set(grouped.flatMap((group) => group.points.map((point) => point.place.id))).size, 120);
});
test("world map preserves source attribution and exact geography with a fresh style object", () => {
  const a = worldStyle(), b = worldStyle();
  assert.equal(a.version, 8);
  assert.equal(a.sources.world.url, "https://tiles.openfreemap.org/planet");
  for (const name of ["OpenFreeMap", "OpenMapTiles", "OpenStreetMap"]) assert.ok(a.sources.world.attribution.includes(name));
  a.layers.pop();
  assert.notEqual(a.layers.length, b.layers.length);
});

import { placeIcon } from "../src/exploration.js";
test("specific place symbols distinguish venue types without changing mood groups", () => {
  for (const [category, icon] of [["Restaurant", "food"], ["Cafe", "cafe"], ["Bar", "bar"], ["Museum", "museum"], ["Gallery", "gallery"], ["Cinema", "film"], ["Park", "garden"], ["Arcade", "play"]]) assert.equal(placeIcon(category), icon);
  assert.equal(placeKind("Restaurant"), "cafe");
  assert.equal(placeKind("Museum"), "gallery");
});
test("city-pack venue kinds file under their venue group, never Outside by default", () => {
  const expected = { brewery: "cafe", winery: "cafe", nightclub: "cafe", biergarten: "cafe", bar: "cafe", pub: "cafe", music_venue: "gallery", comedy_club: "gallery", dance_studio: "play", ice_rink: "play", bicycle_rental: "play", horseback_riding: "play", trampoline_park: "play" };
  for (const [kind, landmark] of Object.entries(expected)) assert.equal(placeKind(kind), landmark, kind);
  assert.equal(placeKind("Park"), "garden");
  assert.equal(placeKind(null), "garden");
});

test("small overlapping collections also cluster while selected places stay reachable", () => {
 const points = ["a","b","c"].map(id=>({place:{id},x:20,y:20}));
 assert.equal(clusterProjectedPlaces(points,null).length,1);
 assert.equal(clusterProjectedPlaces(points,"a").length,2);
});

test("cluster buttons across adjacent grid boundaries do not overlap or lose places",()=>{
 const points=[{place:{id:'a'},x:77,y:40},{place:{id:'b'},x:79,y:40},{place:{id:'c'},x:250,y:40}];
 const groups=clusterProjectedPlaces(points,null,78);
 assert.equal(groups.length,2);
 assert.deepEqual(groups.flatMap(g=>g.points.map(p=>p.place.id)).sort(),['a','b','c']);
 assert.equal(clusterProjectedPlaces(points,'a',78).length,3);
});
