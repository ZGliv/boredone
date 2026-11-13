// Places for one city, as every screen sees them. Pure: no React, no storage.
//
// One set everywhere: the city pack's places minus known closures, through
// cityBoard's own filter, so the number on the Board is the number of dots on
// the Map. The old hand-made Pittsburgh guide only adds notes and openly
// licensed photos to pack places it pairs with by sameVenue, and the map photo
// index adds a pin photo (licensed or venue website, with its credit); neither
// ever adds places of its own.
import { boardFromPack, matchVisits, sameVenue } from "../cityBoard.js";
import { isSuppressedVenue } from "../venueCorrections.js";

export function cityFromPack(pack, now = Date.now()) {
  const open = (pack?.places || []).filter((place) => !isSuppressedVenue(place, now));
  const board = boardFromPack({ ...pack, places: open });
  return { board, places: board.places };
}

// guide: old editorial records ({name, lat, lng, recommendation, photo}).
// A guide photo is kept only when it carries a licence (the bundled Commons
// photos); website photos are never copied onto place.photo.
// photos: the map photo index (src/data/place-photos.json, see placePhotos.js).
// Every pack place it pairs with, by id or sameVenue, gets mapPhoto:
//   {kind: "licensed" | "website", atlas, columns, rows, index, card, credit}
// where credit is the photo's original source record, for the place sheet.
export function enrichPlaces(places, guide = [], photos = null) {
  const extra = new Map();
  const add = (id, fields) => extra.set(id, { ...fields, ...extra.get(id) });
  for (const record of guide) {
    const note = record.recommendation?.text ? record.recommendation : null;
    const photo = record.photo?.license && record.photo?.url ? record.photo : null;
    if (!note && !photo) continue;
    const hit = sameVenue(record, places);
    if (!hit || extra.has(hit.place.id)) continue;
    extra.set(hit.place.id, { ...(note && { recommendation: note }), ...(photo && { photo }) });
  }
  if (photos?.places?.length) {
    const byId = new Map(places.map((place) => [place.id, place]));
    const { atlas, columns, rows } = photos;
    // Licensed photos claim their place first, so a venue paired with both shows the licensed one.
    const records = [...photos.places].sort((a, b) => Number(b.photo.kind === "licensed") - Number(a.photo.kind === "licensed"));
    const claimed = new Set();
    for (const record of records) {
      const place = byId.get(record.id) || sameVenue(record, places)?.place;
      if (!place || claimed.has(place.id)) continue;
      claimed.add(place.id);
      add(place.id, { mapPhoto: { ...record.photo, atlas, columns, rows } });
    }
  }
  return places.map((place) => (extra.has(place.id) ? { ...place, ...extra.get(place.id) } : place));
}

// The city place a journal record points at: same id, else sameVenue.
export function placeForOuting(outing, places, byId) {
  const place = outing?.place;
  if (!place) return null;
  return byId.get(place.id) || sameVenue(place, places)?.place || null;
}

// Map of place id -> "done" | "planned" | "saved" for this city's places.
// Done is exactly what the Board counts (matchVisits), so the two agree.
export function placeStates(places, outings = []) {
  const byId = new Map(places.map((place) => [place.id, place]));
  const states = new Map();
  for (const status of ["saved", "planned"]) {
    for (const outing of outings) {
      if (outing?.status !== status) continue;
      const place = placeForOuting(outing, places, byId);
      if (place) states.set(place.id, status);
    }
  }
  for (const id of matchVisits(places, outings).keys()) states.set(id, "done");
  return states;
}
