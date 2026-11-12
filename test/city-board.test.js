import test from "node:test";
import assert from "node:assert/strict";
import guide from "../src/data/pittsburgh.json" with { type: "json" };
import { makeBoard, boardProgress, generateSets, setProgress, milestones, upgradeBoard, nextUp, matchVisits, normalizeName, ELSEWHERE } from "../src/cityBoard.js";

// Neighborhoods assigned by hand only for records we can place with
// confidence (Butler Street in Lawrenceville, Penn Avenue / Smallman Street
// in the Strip District). Every other record stays without one.
const HOODS = {
  "ofm-23437231801-40.46604--79.96498": "Lawrenceville", // Espresso A Mano
  "ofm-117624486271-40.46629--79.96451": "Lawrenceville", // Field Day
  "ofm-130637047471-40.46754--79.96423": "Lawrenceville", // COLOMBINO Coffee
  "ofm-17074879931-40.46932--79.96130": "Lawrenceville", // Convive Coffee
  "ofm-139003389191-40.46987--79.96070": "Lawrenceville", // Standing Wave Coffee
  "ofm-34789365161-40.46567--79.95572": "Lawrenceville", // Constellation Coffee
  "ofm-38617367681-40.46996--79.96103": "Lawrenceville", // Row House Cinema
  "ofm-38617367571-40.46999--79.96100": "Lawrenceville", // Bierport
  "ofm-38617367621-40.47048--79.96063": "Lawrenceville", // Derby
  "ofm-38617367631-40.47092--79.96038": "Lawrenceville", // Industry Public House
  "ofm-130505582151-40.47136--79.96004": "Lawrenceville", // Bar Botanico
  "ofm-130507342271-40.46588--79.96517": "Lawrenceville", // Driftwood Oven
  "ofm-130505992711-40.46700--79.96439": "Lawrenceville", // Piccolo Forno
  "ofm-130505992701-40.46709--79.96432": "Lawrenceville", // Millie's
  "ofm-3804585142-40.46936--79.96123": "Lawrenceville", // Mi Empanada
  "ofm-60767214421-40.45159--79.98284": "Strip District", // La Prima Espresso Company
  "ofm-47581493411-40.45172--79.98437": "Strip District", // De Fer Coffee & Tea
  "ofm-60740631731-40.45134--79.98384": "Strip District", // Allegheny Coffee & Tea Exchange
  "ofm-6470039332-40.45213--79.98189": "Strip District", // Leaf & Bean
  "ofm-60740639931-40.45196--79.98363": "Strip District", // Pamela's Diner
  "ofm-6465041452-40.45024--79.98568": "Strip District", // Peppi's
  "ofm-24126926841-40.45076--79.98554": "Strip District", // Primanti Bros.
  "ofm-6465041472-40.45018--79.98578": "Strip District", // Mancini's Bread Co
  "ofm-6469207992-40.45134--79.98325": "Strip District", // Enrico Biscotti Company
  "ofm-125943489611-40.45096--79.98631": "Strip District", // Puttshack
  "ofm-111594649251-40.44999--79.98783": "Strip District", // Odd Fellows Ice Cream Co.
};
const STARBUCKS_LAWRENCEVILLE = "ofm-130505992681-40.46827--79.96321";
const STARBUCKS_STRIP = "ofm-118264771791-40.45056--79.98698";

const ALL = guide.places;
const byId = new Map(ALL.map((p) => [p.id, p]));
const real = (id) => {
  const place = byId.get(id);
  assert.ok(place, `fixture record ${id} exists in pittsburgh.json`);
  return place;
};
const withHoods = (places, extra = {}) => places.map((p) => (HOODS[p.id] || extra[p.id] ? { ...p, neighborhood: HOODS[p.id] || extra[p.id] } : p));
const board = (edition = "2026.1", places = withHoods(ALL)) => makeBoard({ cityId: "pittsburgh", cityName: "Pittsburgh", edition, builtAt: "2026-11-11", places });
const hoodIds = (name) => Object.keys(HOODS).filter((id) => HOODS[id] === name);
const LAWRENCEVILLE = hoodIds("Lawrenceville");
const LV_COFFEE = LAWRENCEVILLE.slice(0, 6);
const STRIP = hoodIds("Strip District");

let seq = 0;
const visit = (place, visitDate, extra = {}) => {
  seq++;
  return {
    id: `outing-${seq}`,
    status: "visited",
    place: { id: place.id, name: place.name, lat: place.lat, lng: place.lng, category: place.category },
    visitDate,
    createdAt: `${visitDate}T20:00:00.000Z`,
    updatedAt: `${visitDate}T20:00:00.000Z`,
    ...extra,
  };
};
const day = (n) => `2026-0${1 + Math.floor((n - 1) / 28)}-${String(((n - 1) % 28) + 1).padStart(2, "0")}`;
// A future city pack: same venues, different ids, coordinates a few meters off.
const repack = (places, shift = 0.0002) => places.map((p, i) => ({ ...p, id: `pack-${i}`, lat: p.lat + shift, lng: p.lng - shift }));

// ---- Boards ----

test("a board is a versioned edition of every real venue in the guide", () => {
  const b = board();
  assert.equal(b.cityId, "pittsburgh");
  assert.equal(b.edition, "2026.1");
  assert.equal(b.total, 597);
  assert.equal(b.skipped, 0);
  assert.equal(b.places[b.placeIndex[LV_COFFEE[0]]].name, "Espresso A Mano");
  assert.ok(b.kinds.includes("ice_cream"), "'ice cream' is normalized to a venue kind");
});

test("places without a neighborhood go to an honest Elsewhere bucket, listed last", () => {
  const p = boardProgress(board(), []);
  assert.deepEqual(p.byNeighborhood.map((n) => n.name), ["Lawrenceville", "Strip District", ELSEWHERE]);
  assert.equal(p.byNeighborhood.find((n) => n.name === "Lawrenceville").total, 15);
  assert.equal(p.byNeighborhood.find((n) => n.name === "Strip District").total, 11);
  assert.equal(p.byNeighborhood.find((n) => n.name === ELSEWHERE).total, 597 - 26);
});

test("makeBoard drops duplicates, unknown kinds and missing coordinates without mutating input", () => {
  const espresso = real(LV_COFFEE[0]);
  const input = [espresso, { ...espresso }, { ...real(STRIP[0]), lat: undefined }, { ...real(STRIP[1]), category: "parking" }, real(STRIP[2])];
  const before = structuredClone(input);
  const b = board("x", input);
  assert.equal(b.total, 2);
  assert.equal(b.skipped, 3);
  assert.deepEqual(input, before);
});

test("makeBoard needs a city id and an edition", () => {
  assert.throws(() => makeBoard({ cityId: "", edition: "1", places: [] }));
  assert.throws(() => makeBoard({ cityId: "pittsburgh", edition: "", places: [] }));
});

test("board place order does not depend on input order", () => {
  const a = board("1", withHoods(ALL));
  const b = board("1", withHoods([...ALL].reverse()));
  assert.deepEqual(a.places.map((p) => p.id), b.places.map((p) => p.id));
});

// ---- Progress and identity ----

test("an empty journal shows zero progress, not invented progress", () => {
  const p = boardProgress(board(), []);
  assert.equal(p.done, 0);
  assert.equal(p.percent, 0);
  assert.deepEqual(p.firsts, []);
  assert.deepEqual(p.recent, []);
});

test("a place is done only when the journal has a visited outing with a date", () => {
  const espresso = real(LV_COFFEE[0]);
  const rows = [
    { ...visit(espresso, "2026-01-02"), status: "planned", visitDate: "" },
    { ...visit(real(LV_COFFEE[1]), "2026-01-02"), visitDate: "" },
    visit(real(LV_COFFEE[2]), "2026-01-03"),
  ];
  const p = boardProgress(board(), rows);
  assert.equal(p.done, 1);
  assert.equal(p.recent[0].name, "COLOMBINO Coffee");
});

test("percent rounds down so a nearly finished city never shows 100%", () => {
  const b = board();
  const rows = b.places.slice(0, 596).map((p) => visit(p, "2026-02-01"));
  const p = boardProgress(b, rows);
  assert.equal(p.done, 596);
  assert.equal(p.percent, 99);
});

test("journal ids match a new city pack by name within 120 m", () => {
  const packed = board("pack", repack(withHoods(ALL)));
  const rows = LV_COFFEE.map((id, i) => visit(real(id), day(i + 1)));
  const p = boardProgress(packed, rows);
  assert.equal(p.done, 6);
  assert.equal(p.byNeighborhood.find((n) => n.name === "Lawrenceville").done, 6);
});

test("name matching ignores case, accents, punctuation and a leading 'The'", () => {
  assert.equal(normalizeName("The Church Brew Works"), normalizeName("Church Brew Works"));
  assert.equal(normalizeName("Ineffable Cà Phê"), normalizeName("ineffable ca phe"));
  assert.equal(normalizeName("De Fer Coffee & Tea"), normalizeName("De Fer Coffee and Tea"));
  assert.equal(normalizeName("Long Story Short (Formerly Cinderlands Foederhouse)"), normalizeName("Long Story Short"));
  assert.equal(normalizeName("Millie’s"), normalizeName("Millies"));
});

test("a same-named place more than 120 m away is not a match", () => {
  const espresso = real(LV_COFFEE[0]);
  const packed = board("pack", repack([espresso], 0.002)); // about 280 m off
  assert.equal(boardProgress(packed, [visit(espresso, "2026-01-01")]).done, 0);
});

test("two Starbucks in different neighborhoods each match only their own visit", () => {
  const lv = real(STARBUCKS_LAWRENCEVILLE);
  const strip = real(STARBUCKS_STRIP);
  const packed = board("pack", repack([lv, strip]));
  const earned = matchVisits(packed.places, [visit(lv, "2026-01-01")]);
  assert.equal(earned.size, 1);
  assert.equal(packed.places[packed.placeIndex[[...earned.keys()][0]]].lat.toFixed(3), (lv.lat + 0.0002).toFixed(3));
});

test("an exact id match wins over a nearer name match", () => {
  const espresso = real(LV_COFFEE[0]);
  const decoy = { ...espresso, id: "pack-decoy", lat: espresso.lat + 0.0001 };
  const b = board("x", [espresso, decoy]);
  const earned = matchVisits(b.places, [visit(espresso, "2026-01-01")]);
  assert.deepEqual([...earned.keys()], [espresso.id]);
});

test("repeat visits to one place count once and keep the earliest date", () => {
  const espresso = real(LV_COFFEE[0]);
  const rows = [visit(espresso, "2026-03-01"), visit(espresso, "2026-01-15"), visit(espresso, "2026-02-01")];
  const p = boardProgress(board(), rows);
  assert.equal(p.done, 1);
  assert.equal(p.recent[0].visitDate, "2026-01-15");
});

test("one visit never counts toward two places, even with two same-named candidates nearby", () => {
  const espresso = real(LV_COFFEE[0]);
  const twinA = { ...espresso, id: "pack-a", lat: espresso.lat + 0.0002 };
  const twinB = { ...espresso, id: "pack-b", lat: espresso.lat + 0.0004 };
  const b = board("x", [twinA, twinB]);
  const p = boardProgress(b, [visit(espresso, "2026-01-01")]);
  assert.equal(p.done, 1);
  assert.ok(matchVisits(b.places, [visit(espresso, "2026-01-01")]).has("pack-a"), "the nearer one is credited");
});

test("the same venue saved under two journal ids counts once on a city pack", () => {
  const espresso = real(LV_COFFEE[0]);
  const packed = board("pack", repack([espresso]));
  const rows = [visit(espresso, "2026-01-01"), visit({ ...espresso, id: "custom-espresso" }, "2026-02-01")];
  assert.equal(boardProgress(packed, rows).done, 1);
});

test("a visit without coordinates can match by id but never by name", () => {
  const espresso = real(LV_COFFEE[0]);
  const bare = (id) => ({ ...visit(espresso, "2026-01-01"), place: { id, name: espresso.name } });
  assert.equal(boardProgress(board(), [bare(espresso.id)]).done, 1);
  assert.equal(boardProgress(board("pack", repack([espresso])), [bare(espresso.id)]).done, 0);
});

test("progress does not mutate the journal", () => {
  const rows = LV_COFFEE.map((id, i) => visit(real(id), day(i + 1)));
  const before = structuredClone(rows);
  boardProgress(board(), rows);
  milestones(board(), rows);
  nextUp(board(), rows, { limit: 3 });
  assert.deepEqual(rows, before);
});

test("byKind and firsts reflect real categories and first visits per neighborhood", () => {
  const rows = [visit(real(LV_COFFEE[1]), "2026-01-05"), visit(real(LV_COFFEE[0]), "2026-01-02"), visit(real(STRIP[0]), "2026-01-03")];
  const p = boardProgress(board(), rows);
  assert.deepEqual(p.byKind.find((k) => k.kind === "cafe"), { kind: "cafe", done: 3, total: 101 });
  assert.deepEqual(p.firsts.map((f) => [f.neighborhood, f.name, f.visitDate]), [["Lawrenceville", "Espresso A Mano", "2026-01-02"], ["Strip District", "La Prima Espresso Company", "2026-01-03"]]);
});

// ---- Sets ----

test("sets are small, finishable and built only from real data", () => {
  const sets = generateSets(board());
  for (const set of sets) {
    assert.ok(set.goal >= 4 && set.goal <= 15, `${set.name} goal ${set.goal}`);
    for (const id of set.members) assert.ok(byId.has(id));
  }
  assert.deepEqual(sets.map((s) => s.name), [
    "Lawrenceville bars",
    "Lawrenceville coffee spots",
    "Lawrenceville places to eat",
    "Pittsburgh bakeries",
    "Pittsburgh ice cream shops",
    "Pittsburgh nightclubs",
    "Strip District coffee spots",
    "Strip District places to eat",
    "Taste of Lawrenceville",
    "Taste of Strip District",
  ]);
});

test("a neighborhood taste set asks for any 5, not all", () => {
  const taste = generateSets(board()).find((s) => s.name === "Taste of Lawrenceville");
  assert.equal(taste.rule, "any");
  assert.equal(taste.goal, 5);
  assert.equal(taste.size, 15);
  assert.equal(taste.description, "Visit any 5 of 15");
});

test("set ids are stable across editions when membership is unchanged", () => {
  const a = generateSets(board("2026.1"));
  const b = generateSets(board("2027.1", withHoods([...ALL].reverse())));
  assert.deepEqual(a.map((s) => s.id), b.map((s) => s.id));
});

test("a set gets a new id when its membership changes, other sets keep theirs", () => {
  const without = withHoods(ALL.filter((p) => p.id !== LV_COFFEE[1]));
  const a = generateSets(board("1"));
  const b = generateSets(board("2", without));
  const name = (sets, n) => sets.find((s) => s.name === n);
  assert.notEqual(name(a, "Lawrenceville coffee spots").id, name(b, "Lawrenceville coffee spots").id);
  assert.equal(name(a, "Lawrenceville coffee spots").key, name(b, "Lawrenceville coffee spots").key);
  assert.equal(name(a, "Pittsburgh bakeries").id, name(b, "Pittsburgh bakeries").id);
});

test("setProgress counts unique places and dates completion from the deciding visit", () => {
  const b = board();
  const set = generateSets(b).find((s) => s.name === "Lawrenceville coffee spots");
  const rows = LV_COFFEE.map((id, i) => visit(real(id), day(i + 1)));
  rows.push(visit(real(LV_COFFEE[0]), "2026-05-01"));
  const p = setProgress(set, rows);
  assert.equal(p.done, 6);
  assert.equal(p.complete, true);
  assert.equal(p.completedOn, day(6));
  assert.deepEqual(setProgress(set, rows.slice(0, 4)), { ...setProgress(set, rows.slice(0, 4)), done: 4, remaining: 2, complete: false, completedOn: null });
});

test("setProgress with the board agrees with matching against the set alone", () => {
  const b = board();
  const set = generateSets(b).find((s) => s.name === "Strip District coffee spots");
  const rows = STRIP.slice(0, 3).map((id, i) => visit(real(id), day(i + 1)));
  assert.deepEqual(setProgress(set, rows, b), setProgress(set, rows));
});

test("an any-5 set completes on the fifth distinct place, not the fifth visit", () => {
  const set = generateSets(board()).find((s) => s.name === "Taste of Strip District");
  const rows = [visit(real(STRIP[0]), "2026-01-01"), visit(real(STRIP[0]), "2026-01-02"), ...STRIP.slice(1, 5).map((id, i) => visit(real(id), `2026-02-0${i + 1}`))];
  const p = setProgress(set, rows);
  assert.equal(p.done, 5);
  assert.equal(p.completedOn, "2026-02-04");
});

// ---- Milestones ----

test("milestones are dated by the visits that earned them", () => {
  const rows = LV_COFFEE.map((id, i) => visit(real(id), day(i + 1)));
  const list = milestones(board(), rows);
  const get = (id) => list.find((m) => m.id === id);
  assert.equal(get("first:lawrenceville").date, day(1));
  assert.equal(get("first:lawrenceville").label, "First place in Lawrenceville");
  const coffee = list.find((m) => m.label === "Completed Lawrenceville coffee spots");
  assert.equal(coffee.type, "set-complete");
  assert.equal(coffee.date, day(6));
  assert.equal(list.find((m) => m.label === "Completed Taste of Lawrenceville").date, day(5), "any 5 is earned on the fifth place");
  assert.equal(get("neighborhood:lawrenceville"), undefined, "a neighborhood is not finished by its cafes alone");
});

test("finishing every place in a neighborhood is a dated milestone", () => {
  const rows = LAWRENCEVILLE.map((id, i) => visit(real(id), day(i + 1)));
  const m = milestones(board(), rows).find((x) => x.id === "neighborhood:lawrenceville");
  assert.equal(m.date, day(15));
  assert.equal(boardProgress(board(), rows).byNeighborhood[0].complete, true);
});

test("count milestones use distinct places and the date of the nth one", () => {
  const b = board();
  const places = b.places.filter((p) => p.neighborhood === ELSEWHERE).slice(0, 26);
  const rows = places.map((p, i) => visit(p, day(i + 1)));
  rows.push(visit(places[0], day(30)), visit(places[0], day(31)));
  const counts = milestones(b, rows).filter((m) => m.type === "places");
  assert.deepEqual(counts.map((m) => [m.id, m.date]), [["count:10", day(10)], ["count:25", day(25)]]);
});

test("a kind is complete only when every one of that kind is done", () => {
  const b = board();
  const nightclubs = b.places.filter((p) => p.kind === "nightclub");
  const rows = nightclubs.map((p, i) => visit(p, day(i + 3)));
  const list = milestones(b, rows);
  assert.equal(list.find((m) => m.id === "kind:nightclub").date, day(nightclubs.length + 2));
  assert.equal(milestones(b, rows.slice(1)).some((m) => m.id === "kind:nightclub"), false);
  assert.equal(milestones(b, [visit(b.places.find((p) => p.kind === "brewery"), day(1))]).some((m) => m.type === "kind-complete"), false, "a one-place kind is not a collection");
});

test("milestones come back sorted by date and are not awarded on an empty journal", () => {
  assert.deepEqual(milestones(board(), []), []);
  const rows = [...STRIP.slice(0, 5), ...LV_COFFEE].map((id, i) => visit(real(id), day(20 - i)));
  const dates = milestones(board(), rows).map((m) => m.date);
  assert.deepEqual(dates, [...dates].sort());
});

// ---- Editions ----

test("a closed place leaves the new edition but stays earned in the retired tally", () => {
  const v1 = board("2026.1");
  const closedId = LV_COFFEE[1]; // Field Day
  const v2 = upgradeBoard(v1, board("2026.2", withHoods(ALL.filter((p) => p.id !== closedId))), LV_COFFEE.map((id, i) => visit(real(id), day(i + 1))));
  const rows = LV_COFFEE.map((id, i) => visit(real(id), day(i + 1)));
  const p = boardProgress(v2, rows);
  assert.equal(p.total, 596);
  assert.equal(p.done, 5);
  assert.equal(p.retired, 1);
  assert.equal(v2.retired[0].name, "Field Day");
  assert.equal(v2.retired[0].retiredFrom, "2026.1");
  assert.deepEqual(v2.previousEditions, ["2026.1"]);
});

test("a set completed under the old edition stays completed after its membership changes", () => {
  const v1 = board("2026.1");
  const rows = LV_COFFEE.map((id, i) => visit(real(id), day(i + 1)));
  const v2 = upgradeBoard(v1, board("2026.2", withHoods(ALL.filter((p) => p.id !== LV_COFFEE[1]))), rows);
  const oldSet = generateSets(v1).find((s) => s.name === "Lawrenceville coffee spots");
  const done = milestones(v2, rows).find((m) => m.id === `set:${oldSet.id}`);
  assert.equal(done.edition, "2026.1");
  assert.equal(done.date, day(6));
});

test("a new venue in a finished neighborhood never un-finishes it", () => {
  const rows = LAWRENCEVILLE.map((id, i) => visit(real(id), day(i + 1)));
  const v1 = board("2026.1");
  const v2 = upgradeBoard(v1, board("2026.2", withHoods(ALL, { [STARBUCKS_LAWRENCEVILLE]: "Lawrenceville" })), rows);
  const hood = boardProgress(v2, rows).byNeighborhood.find((n) => n.name === "Lawrenceville");
  assert.deepEqual(hood, { name: "Lawrenceville", done: 15, total: 16, complete: true, completedEdition: "2026.1" });
  assert.equal(milestones(v2, rows).find((m) => m.id === "neighborhood:lawrenceville").date, day(15));
  assert.equal(nextUp(v2, rows, { limit: 1 })[0].place.name, "Starbucks", "the new place is an invitation, not a loss");
});

test("lifetime count milestones survive a closure", () => {
  const b = board("2026.1");
  const places = [...LV_COFFEE.map(real), ...b.places.filter((p) => p.neighborhood === ELSEWHERE).slice(0, 4)];
  const rows = places.map((p, i) => visit(p, day(i + 1)));
  const v2 = upgradeBoard(b, board("2026.2", withHoods(ALL.filter((p) => p.id !== LV_COFFEE[1]))), rows);
  assert.equal(boardProgress(v2, rows).done, 9);
  assert.equal(milestones(v2, rows).find((m) => m.id === "count:10").date, day(10));
});

test("deleting the memory of a retired place removes it honestly", () => {
  const rows = LV_COFFEE.map((id, i) => visit(real(id), day(i + 1)));
  const v2 = upgradeBoard(board("2026.1"), board("2026.2", withHoods(ALL.filter((p) => p.id !== LV_COFFEE[1]))), rows);
  const kept = rows.filter((r) => r.place.id !== LV_COFFEE[1]);
  assert.equal(boardProgress(v2, kept).retired, 0);
});

test("a city pack with new ids keeps venues that still exist off the retired list", () => {
  const rows = LV_COFFEE.map((id, i) => visit(real(id), day(i + 1)));
  const v2 = upgradeBoard(board("2026.1"), board("pack-2027", repack(withHoods(ALL))), rows);
  assert.deepEqual(v2.retired, []);
  assert.equal(boardProgress(v2, rows).done, 6);
});

test("honors and retired places carry through several editions without duplicates", () => {
  const rows = LV_COFFEE.map((id, i) => visit(real(id), day(i + 1)));
  const v1 = board("2026.1");
  const v2 = upgradeBoard(v1, board("2026.2", withHoods(ALL.filter((p) => p.id !== LV_COFFEE[1]))), rows);
  const v3 = upgradeBoard(v2, board("2027.1", withHoods(ALL.filter((p) => p.id !== LV_COFFEE[1] && p.id !== LV_COFFEE[2]))), rows);
  assert.deepEqual(v3.retired.map((p) => p.name).sort(), ["COLOMBINO Coffee", "Field Day"]);
  assert.deepEqual(v3.previousEditions, ["2026.1", "2026.2"]);
  const setHonors = v3.honors.filter((h) => h.type === "set");
  assert.equal(new Set(setHonors.map((h) => h.key)).size, setHonors.length);
  assert.ok(setHonors.some((h) => h.edition === "2026.1"));
  assert.equal(boardProgress(v3, rows).retired, 2);
});

test("a retired place's visit is not also credited to a current place", () => {
  const rows = [visit(real(LV_COFFEE[1]), "2026-01-01")];
  const v2 = upgradeBoard(board("2026.1"), board("2026.2", withHoods(ALL.filter((p) => p.id !== LV_COFFEE[1]))), rows);
  const p = boardProgress(v2, rows);
  assert.equal(p.done + p.retired, 1);
});

test("upgrading to another city is refused", () => {
  const other = makeBoard({ cityId: "cleveland", cityName: "Cleveland", edition: "1", builtAt: "", places: [] });
  assert.throws(() => upgradeBoard(board(), other, []));
});

// ---- Review regressions ----

// A synthetic venue shaped like the shared place contract, for cases the
// Pittsburgh data cannot express (non-Latin names, moved coordinates).
const spot = (id, name, lat, lng, neighborhood) => ({ id, name, lat, lng, category: "cafe", address: "", website: "", source: "test", sourceUrl: "", hours: "", fee: "", access: "", distanceKm: 0, ...(neighborhood ? { neighborhood } : {}) });
const tiny = (edition, places) => makeBoard({ cityId: "anywhere", cityName: "Anywhere", edition, builtAt: "", places });

test("name matching works for names written in any script", () => {
  assert.notEqual(normalizeName("匹夫小馆"), "");
  assert.notEqual(normalizeName("匹夫小馆"), normalizeName("Кофейня"));
  assert.equal(normalizeName("Straße Café"), "straße cafe");
  assert.equal(normalizeName("PF BBQ House - 匹夫小馆"), "pf bbq house 匹夫小馆");
  const pack = spot("pack-1", "匹夫小馆", 40.45, -79.95);
  assert.equal(matchVisits([pack], [visit({ ...pack, id: "ofm-1" }, "2026-01-01")]).size, 1);
});

test("an upgrade never erases a visit to a place whose name has no Latin letters", () => {
  const cafe = spot("ofm-1", "匹夫小馆", 40.45, -79.95);
  const rows = [visit(cafe, "2026-01-01")];
  const v2 = upgradeBoard(tiny("1", [cafe]), tiny("2", [spot("pack-9", "Кофейня", 40.4505, -79.95)]), rows);
  const p = boardProgress(v2, rows);
  assert.equal(p.done + p.retired, 1);
});

test("an upgrade that shifts a venue's coordinates keeps the visit counted", () => {
  // Journal point, old pack point ~100 m north, new pack point ~100 m further:
  // each pair is within 120 m, but the journal is ~200 m from the new point.
  const journal = spot("ofm-1", "Gamma", 40.46, -79.96);
  const rows = [visit(journal, "2026-03-01")];
  const v1 = tiny("1", [spot("pack-1", "Gamma", 40.4609, -79.96)]);
  assert.equal(boardProgress(v1, rows).done, 1);
  const v2 = upgradeBoard(v1, tiny("2", [spot("pack2-1", "Gamma", 40.4618, -79.96)]), rows);
  const p = boardProgress(v2, rows);
  assert.equal(p.done + p.retired, 1);
  assert.equal(milestones(v2, rows).length, 0, "no milestone is invented either");
});

test("totals the user earned never drop when editions go back and forth", () => {
  const a = spot("a", "Alpha", 40.46, -79.96);
  const b = spot("b", "Beta", 40.47, -79.97);
  const rows = [visit(a, "2026-02-01"), visit(b, "2026-02-02")];
  let current = tiny("1", [a, b]);
  for (const next of [tiny("2", [a]), tiny("1", [a, b]), tiny("2", [a]), tiny("3", [])]) {
    current = upgradeBoard(current, next, rows);
    const p = boardProgress(current, rows);
    assert.equal(p.done + p.retired, 2, `edition ${current.edition}`);
  }
});

test("first place in a neighborhood survives that place closing or moving", () => {
  const a = spot("a", "Alpha", 40.46, -79.96, "Lawrenceville");
  const b = spot("b", "Beta", 40.461, -79.961, "Lawrenceville");
  const rows = [visit(a, "2026-02-01")];
  const closed = upgradeBoard(tiny("1", [a, b]), tiny("2", [b]), rows);
  const first = milestones(closed, rows).find((m) => m.id === "first:lawrenceville");
  assert.deepEqual([first?.date, first?.edition], ["2026-02-01", "1"]);
  const moved = upgradeBoard(tiny("1", [a, b]), tiny("2", [{ ...a, neighborhood: "Bloomfield" }, b]), rows);
  assert.ok(milestones(moved, rows).some((m) => m.id === "first:lawrenceville"));
});

test("an empty board shows nothing and invents nothing", () => {
  const empty = tiny("1", []);
  const rows = [visit(real(LV_COFFEE[0]), "2026-01-01")];
  assert.deepEqual([boardProgress(empty, rows).done, boardProgress(empty, rows).percent], [0, 0]);
  assert.deepEqual(generateSets(empty), []);
  assert.deepEqual(milestones(empty, rows), []);
  assert.deepEqual(nextUp(empty, rows), []);
});

// ---- Next up ----

test("nextUp points at the nearest undone place in the closest-to-finished set", () => {
  const rows = STRIP.slice(0, 3).map((id, i) => visit(real(id), day(i + 1)));
  const pamelas = real(STRIP[4]);
  const ideas = nextUp(board(), rows, { location: { lat: pamelas.lat, lng: pamelas.lng }, limit: 2 });
  assert.equal(ideas[0].place.name, "Leaf & Bean");
  assert.equal(ideas[0].reason, "1 left to finish Strip District coffee spots");
  assert.equal(ideas[1].place.name, "Pamela's Diner", "then the nearest place toward the next closest goal");
  assert.equal(ideas[1].reason, "2 more for Taste of Strip District");
  assert.equal(ideas[1].distanceKm, 0);
});

test("nextUp prefers the closest-to-finished group over a nearer place", () => {
  const rows = LV_COFFEE.slice(0, 3).map((id, i) => visit(real(id), day(i + 1)));
  const constellation = real(LV_COFFEE[5]);
  const ideas = nextUp(board(), rows, { location: { lat: constellation.lat, lng: constellation.lng }, limit: 1 });
  assert.equal(ideas[0].reason, "2 more for Taste of Lawrenceville");
  assert.equal(ideas[0].place.name, "Constellation Coffee");
});

test("nextUp never suggests a place already done and respects the limit", () => {
  const rows = LAWRENCEVILLE.slice(0, 10).map((id, i) => visit(real(id), day(i + 1)));
  const ideas = nextUp(board(), rows, { limit: 4 });
  assert.equal(ideas.length, 4);
  for (const idea of ideas) assert.ok(!LAWRENCEVILLE.slice(0, 10).includes(idea.place.id));
  assert.equal(new Set(ideas.map((i) => i.place.id)).size, 4);
});

test("nextUp reasons are truthful about how much is left", () => {
  const b = board();
  for (const idea of nextUp(b, [], { limit: 20 })) {
    const n = Number(idea.reason.match(/^\d+/)?.[0]);
    if (Number.isFinite(n)) assert.equal(n, idea.remaining);
    else assert.match(idea.reason, /^Would be your first place in /);
  }
});

test("nextUp is deterministic without a location and empty when nothing is left", () => {
  const b = board("x", withHoods(LV_COFFEE.map(real)));
  assert.deepEqual(nextUp(b, [], { limit: 3 }), nextUp(b, [], { limit: 3 }));
  const all = LV_COFFEE.map((id, i) => visit(real(id), day(i + 1)));
  assert.deepEqual(nextUp(b, all), []);
});
