import test from "node:test";
import assert from "node:assert/strict";
import { closestSet, eventsQuery, isoWithOffset, linkEvents, pickDay, pickView, planFor, planFromPick, saveForPlace, sessionDate, tonightContext, tonightEnd, tonightSaves } from "../src/tonight/tonightModel.js";
import { decideTonight } from "../src/decide.js";
import { makeSave } from "../src/saves.js";

const bar = { id: "p-bar", name: "Gooski's", lat: 40.4655, lng: -79.9566, category: "bar", neighborhood: "Polish Hill" };
const cafe = { id: "p-cafe", name: "Constellation Coffee", lat: 40.4669, lng: -79.9573, category: "coffee_shop", neighborhood: "Lawrenceville" };
const here = { lat: 40.4650, lng: -79.9560 };

test("isoWithOffset writes local wall-clock time with the zone offset decide needs", () => {
  const now = new Date(2026, 10, 13, 18, 10, 5);
  const iso = isoWithOffset(now);
  assert.match(iso, /^2026-11-13T18:10:05[+-]\d{2}:\d{2}$/);
  assert.equal(Date.parse(iso), now.getTime());
  assert.doesNotThrow(() => decideTonight({ context: tonightContext({ now }) }));
});

test("tonight ends at 5 am and the session day rolls over then, not at midnight", () => {
  const evening = new Date(2026, 10, 13, 21, 0);
  assert.equal(tonightEnd(evening).getTime(), new Date(2026, 10, 14, 5, 0).getTime());
  const late = new Date(2026, 10, 14, 1, 30);
  assert.equal(tonightEnd(late).getTime(), new Date(2026, 10, 14, 5, 0).getTime());
  assert.equal(sessionDate(late), "2026-11-13");
  assert.equal(sessionDate(evening), "2026-11-13");
});

test("context only carries the dials that are set", () => {
  const now = new Date(2026, 10, 13, 18, 0);
  assert.deepEqual(Object.keys(tonightContext({ now })), ["now"]);
  const full = tonightContext({ now, location: { lat: 1, lng: 2, accuracy: 9 }, companions: "date", energy: "low" });
  assert.deepEqual(full.location, { lat: 1, lng: 2 });
  assert.equal(full.companions, "date");
  assert.equal(full.energy, "low");
});

test("eventsQuery asks for tonight around a point, clamped to the server's radius limits", () => {
  const now = new Date(2026, 10, 13, 18, 0);
  const q = new URLSearchParams(eventsQuery({ center: here, radiusKm: 120, now }));
  assert.equal(q.get("radiusKm"), "50");
  assert.equal(q.get("lat"), "40.465");
  assert.equal(Date.parse(q.get("to")), tonightEnd(now).getTime());
  assert.equal(eventsQuery({ center: null, now }), "");
});

test("linkEvents pairs an event with a city place only when name and position agree", () => {
  const [linked, far, other] = linkEvents([
    { id: "e1", title: "Trivia", start: "2026-11-13T20:00:00-05:00", venueName: "Gooski's", lat: 40.4656, lng: -79.9567 },
    { id: "e2", title: "Trivia", start: "2026-11-13T20:00:00-05:00", venueName: "Gooski's", lat: 40.50, lng: -79.90 },
    { id: "e3", title: "Show", start: "2026-11-13T20:00:00-05:00", venueName: "Elsewhere Hall", lat: 40.4656, lng: -79.9567 },
  ], [bar, cafe]);
  assert.equal(linked.placeId, "p-bar");
  assert.equal(far.placeId, undefined);
  assert.equal(other.placeId, undefined);
});

test("pickView keeps decide's reasons but moves distance out and drops the repeated kind line", () => {
  const now = new Date(2026, 10, 13, 18, 0);
  const { picks } = decideTonight({ places: [bar], context: tonightContext({ now, location: here }) });
  const view = pickView(picks[0], { location: here });
  assert.equal(view.title, "Gooski's");
  assert.equal(view.line, "Bar in Polish Hill");
  assert.match(view.distance, /^\d+ m$/);
  assert.ok(view.reasons.every((r) => !/ away$/.test(r.text)));
  const noLoc = pickView(decideTonight({ places: [bar], context: tonightContext({ now }) }).picks[0]);
  assert.equal(noLoc.distance, "");
  assert.deepEqual(noLoc.reasons, []);
});

test("an unplaced note is never one of tonight's three; a placed save is", () => {
  const now = new Date(2026, 10, 13, 18, 0);
  const note = makeSave({ text: "that ramen place Sam mentioned", now: new Date(2026, 10, 1) });
  const reel = makeSave({ url: "https://www.instagram.com/reel/abc", now: new Date(2026, 10, 1) });
  const placed = makeSave({ text: "Gooski's", place: bar, now: new Date(2026, 10, 1) });
  const far = makeSave({ text: "far", place: { id: "p-far", name: "Far Bar", lat: 41.5, lng: -81.7, category: "bar" }, now: new Date(2026, 10, 1) });
  const kept = tonightSaves([note, reel, placed, far], { places: [bar, cafe], placeById: new Map([[bar.id, bar], [cafe.id, cafe]]), center: here, reach: 25 });
  assert.deepEqual(kept.map((s) => s.id), [placed.id]);
  const { picks } = decideTonight({ saves: kept, places: [cafe], context: tonightContext({ now, location: here }) });
  const views = picks.map((p) => pickView(p, { location: here }));
  assert.ok(views.every((v) => v.place && v.spot && v.distance), "every pick has a place, a spot and a distance");
  const view = views.find((v) => v.save?.id === placed.id);
  assert.equal(view.title, "Gooski's");
  assert.equal(view.reasons[0].tone, "blue");
  assert.match(view.reasons[0].text, /^Saved/);
});

test("Go turns a placed save into tonight's plan and keeps its source", () => {
  const now = new Date(2026, 10, 13, 19, 0);
  const save = makeSave({ url: "https://www.instagram.com/reel/abc", place: bar, now: new Date(2026, 10, 1) });
  const pick = { id: `save:${save.id}`, kind: "save", save, place: save.place };
  const plan = planFromPick(pick, { outings: [save], now });
  assert.equal(plan.id, save.id);
  assert.equal(plan.status, "planned");
  assert.equal(plan.planDate, "2026-11-13");
  assert.equal(plan.source.app, "instagram");
  assert.equal(planFor(pick, [plan]).id, save.id);
});

test("Go has nothing to plan for a save without a place", () => {
  const save = makeSave({ text: "rooftop bar" });
  assert.equal(planFromPick({ id: "save:x", kind: "save", save }, { now: new Date() }), null);
});

test("Go on a place makes a new plan, or re-dates the one you already had", () => {
  const now = new Date(2026, 10, 13, 19, 0);
  const pick = { id: "place:p-cafe", kind: "place", place: cafe };
  const plan = planFromPick(pick, { outings: [], now });
  assert.equal(plan.place.id, "p-cafe");
  assert.equal(plan.planDate, "2026-11-13");
  const old = { ...plan, planDate: "2026-10-01" };
  const again = planFromPick(pick, { outings: [old], now });
  assert.equal(again.id, plan.id);
  assert.equal(again.planDate, "2026-11-13");
  assert.equal(planFromPick(pick, { outings: [again], now }), again);
});

test("Go on an event plans its venue with the event as the note", () => {
  const now = new Date(2026, 10, 13, 19, 0);
  const event = { id: "tm-1", title: "Late show", start: "2026-11-13T21:00:00-05:00", venueName: "Club Café", lat: 40.43, lng: -79.98, url: "https://example.com/e" };
  const plan = planFromPick({ id: "event:tm-1", kind: "event", event }, { now });
  assert.equal(plan.place.name, "Club Café");
  assert.equal(plan.place.id, "event-tm-1");
  assert.equal(plan.notes, "Late show");
  const unlocated = planFromPick({ id: "event:tm-2", kind: "event", event: { ...event, id: "tm-2", lat: null, lng: null } }, { now });
  assert.equal(unlocated.place.name, "Club Café");
  assert.equal(unlocated.place.lat, undefined);
  const linked = planFromPick({ id: "event:tm-1", kind: "event", event, place: bar }, { now });
  assert.equal(linked.place.id, "p-bar");
});

test("closestSet is the started set with the fewest left (ties go to the bigger share), and ignores untouched sets", () => {
  const sets = [
    { id: "a", name: "Polish Hill bars", goal: 4, members: ["1", "2", "3", "4"] },
    { id: "b", name: "Lawrenceville cafes", goal: 10, members: ["5", "6", "7", "8", "9", "10", "11", "12", "13", "14"] },
    { id: "c", name: "Tiny", goal: 4, members: ["20", "21", "22", "23"] },
    { id: "d", name: "Done already", goal: 4, members: ["30", "31", "32", "33"] },
  ];
  const states = new Map([["1", "done"], ["2", "done"], ["5", "done"], ["6", "done"], ["7", "done"], ["8", "done"], ["9", "done"], ["10", "done"], ["11", "done"], ["12", "done"], ["3", "saved"], ["30", "done"], ["31", "done"], ["32", "done"], ["33", "done"]]);
  assert.deepEqual(closestSet(sets, states), { id: "b", name: "Lawrenceville cafes", done: 8, goal: 10, remaining: 2 });
  states.set("3", "done");
  assert.equal(closestSet(sets, states).id, "a");
  assert.equal(closestSet(sets, new Map()), null);
});

test("saveForPlace finds the pile entry behind a place, by id or same venue", () => {
  const save = makeSave({ url: "https://www.tiktok.com/@x/video/1", place: { ...bar, id: "guide-77" } });
  const byId = new Map([[bar.id, bar], [cafe.id, cafe]]);
  assert.equal(saveForPlace(bar, [save], [bar, cafe], byId)?.id, save.id);
  assert.equal(saveForPlace(cafe, [save], [bar, cafe], byId), null);
});

test("a plan saved from an older guide is found by venue, so Go and Done never duplicate it", () => {
  const now = new Date(2026, 10, 13, 19, 0);
  const places = [bar, cafe], placeById = new Map(places.map((p) => [p.id, p]));
  const legacy = { id: "legacy-plan", status: "planned", planDate: "2026-11-13", place: { ...bar, id: "osm-node-111" }, createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", notes: "", with: "", photos: [], rating: 0, visitDate: "" };
  const pick = { id: "place:p-bar", kind: "place", place: bar };
  assert.equal(planFor(pick, [legacy], { places, placeById })?.id, "legacy-plan");
  assert.equal(planFor({ place: bar }, [legacy], { places, placeById })?.id, "legacy-plan", "the map sheet finds it too");
  assert.equal(planFromPick(pick, { outings: [legacy], now, places, placeById }), legacy, "already tonight: nothing new to write");
  const moved = planFromPick(pick, { outings: [{ ...legacy, planDate: "2026-11-20" }], now, places, placeById });
  assert.equal(moved.id, "legacy-plan");
  assert.equal(moved.planDate, "2026-11-13");
  // A save for a venue that already has a plan re-dates that plan.
  const save = makeSave({ text: "Gooski's", place: bar, now: new Date(2026, 10, 1) });
  const fromSave = planFromPick({ id: `save:${save.id}`, kind: "save", save, place: bar }, { outings: [save, { ...legacy, planDate: "2026-10-01" }], now, places, placeById });
  assert.equal(fromSave.id, "legacy-plan");
});

test("Go re-reads the save: a save done or deleted since the picks were drawn is not overwritten", () => {
  const now = new Date(2026, 10, 13, 19, 0);
  const save = makeSave({ text: "Gooski's", place: bar, now: new Date(2026, 10, 1) });
  const pick = { id: `save:${save.id}`, kind: "save", save, place: bar };
  assert.equal(planFromPick(pick, { outings: [], now }), null, "deleted elsewhere");
  assert.equal(planFromPick(pick, { outings: [{ ...save, status: "visited", visitDate: "2026-11-12", rating: 5 }], now }), null, "done elsewhere");
});

test("a save dated later this week is planned for its own day, not tonight", () => {
  const now = new Date(2026, 10, 12, 19, 0);
  const save = makeSave({ text: "night market", place: cafe, eventDate: "2026-11-14", now: new Date(2026, 10, 10) });
  const pick = { id: `save:${save.id}`, kind: "save", save, place: cafe };
  assert.equal(pickDay(pick, now), "2026-11-14");
  assert.equal(planFromPick(pick, { outings: [save], now }).planDate, "2026-11-14");
  assert.equal(pickDay({ id: "place:p-cafe", kind: "place", place: cafe }, now), "2026-11-12");
  assert.equal(pickDay(pick, new Date(2026, 10, 15, 1, 0)), "2026-11-14", "after midnight it is still that night");
});

test("pickView names a placed save by the city's record", () => {
  const now = new Date(2026, 10, 13, 18, 0);
  const legacy = makeSave({ text: "x", place: { ...bar, id: "guide-1", neighborhood: "" }, now: new Date(2026, 10, 1) });
  const pick = decideTonight({ saves: [legacy], context: tonightContext({ now }) }).picks[0];
  assert.equal(pickView(pick, { placeOf: () => bar }).line, "Bar in Polish Hill");
});
