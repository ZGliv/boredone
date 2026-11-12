import test from "node:test";
import assert from "node:assert/strict";
import { closestSet, eventsQuery, isoWithOffset, linkEvents, pickView, planFor, planFromPick, saveForPlace, sessionDate, tonightContext, tonightEnd } from "../src/tonight/tonightModel.js";
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

test("pickView marks save age blue and names an unplaced save by its note", () => {
  const now = new Date(2026, 10, 13, 18, 0);
  const save = makeSave({ text: "that ramen place Sam mentioned", now: new Date(2026, 10, 1) });
  const { picks } = decideTonight({ saves: [save], context: tonightContext({ now }) });
  const view = pickView(picks[0]);
  assert.equal(view.title, "that ramen place Sam mentioned");
  assert.equal(view.line, "From a note");
  assert.equal(view.unplaced, true);
  assert.equal(view.reasons[0].tone, "blue");
  assert.match(view.reasons[0].text, /^Saved/);
  assert.deepEqual(view.reasons.map((r) => r.text).slice(1), ["Place not confirmed"]);
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
