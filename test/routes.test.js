import test from "node:test";
import assert from "node:assert/strict";
import { hashTarget, pageFromHash, targetHash } from "../src/app/routes.js";

test("pageFromHash lands linked pages and old links on a real page", () => {
  assert.equal(pageFromHash("#pile"), "pile");
  assert.equal(pageFromHash("#map/overture-abc"), "map");
  assert.equal(pageFromHash("#pile/5f0c"), "pile");
  assert.equal(pageFromHash("#plans"), "journal");
  assert.equal(pageFromHash("#nowhere/x"), "map");
  assert.equal(pageFromHash(""), "map");
});

test("targetHash and hashTarget round-trip ids with any characters", () => {
  for (const id of ["overture-bcfceca5-2869", "a/b c#d", "Café ü"]) {
    const hash = `#${targetHash("map", id)}`;
    assert.equal(pageFromHash(hash), "map");
    assert.equal(hashTarget(hash), id);
  }
  assert.equal(hashTarget("#map"), "");
  assert.equal(hashTarget("#map/%E0%A4%A"), "");
});

test("directions searches the place name around its coordinates", async () => {
  const { directions } = await import("../src/app/routes.js");
  assert.equal(
    directions({ name: "The Alcove", lat: 40.424518917350866, lng: -80.04100620746613 }),
    "https://www.google.com/maps/search/The%20Alcove/@40.42452,-80.04101,17z",
  );
  assert.equal(
    directions({ name: "Primanti Bros.", address: "46 18th St", lat: 40.45, lng: -79.98 }),
    "https://www.google.com/maps/search/Primanti%20Bros.%2C%2046%2018th%20St/@40.45,-79.98,17z",
  );
  assert.equal(
    directions({ name: "Kaya", address: "2000 Smallman St" }),
    "https://www.google.com/maps/search/?api=1&query=Kaya%202000%20Smallman%20St",
  );
  assert.equal(directions({ name: "Kaya" }), "https://www.google.com/maps/search/?api=1&query=Kaya");
  assert.equal(
    directions({ lat: 40.1, lng: -80.2 }),
    "https://www.google.com/maps/search/?api=1&query=40.1%2C-80.2",
  );
});
