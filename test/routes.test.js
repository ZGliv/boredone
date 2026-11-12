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
