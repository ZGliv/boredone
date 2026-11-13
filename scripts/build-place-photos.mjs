// Writes src/data/place-photos.json: the old Pittsburgh guide's places that
// have a bundled photo preview, each with its atlas cell, card preview and full
// original source/credit record. Run after the guide or previews change:
//   node scripts/build-place-photos.mjs
// test/place-photos.test.js fails while the file is out of date.
import { writeFileSync } from "node:fs";
import { bundledArea, DEFAULT_AREA, CORRIDOR_AREA } from "../src/preloaded.js";
import { photoIndex } from "../src/city/placePhotos.js";
import previews from "../src/data/photo-previews.json" with { type: "json" };

export function buildPlacePhotos() {
  const guide = [...bundledArea(DEFAULT_AREA, 5000).places, ...bundledArea(CORRIDOR_AREA, 5000).places];
  return photoIndex(guide, previews);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const index = buildPlacePhotos();
  writeFileSync(new URL("../src/data/place-photos.json", import.meta.url), JSON.stringify(index) + "\n");
  const kinds = index.places.reduce((n, p) => ({ ...n, [p.photo.kind]: (n[p.photo.kind] || 0) + 1 }), {});
  console.log(`${index.places.length} guide places with a photo`, kinds);
}
