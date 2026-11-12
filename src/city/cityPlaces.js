// Places for one city, as every screen sees them. Pure: no React, no storage.
//
// One set everywhere: the city pack's places minus known closures, through
// cityBoard's own filter, so the number on the Board is the number of dots on
// the Map. The old hand-made Pittsburgh guide only adds notes and openly
// licensed photos to pack places it pairs with by sameVenue; it never adds
// places of its own.
import { boardFromPack, matchVisits, sameVenue } from "../cityBoard.js";
import { isSuppressedVenue } from "../venueCorrections.js";

export function cityFromPack(pack, now = Date.now()) {
  const open = (pack?.places || []).filter((place) => !isSuppressedVenue(place, now));
  const board = boardFromPack({ ...pack, places: open });
  return { board, places: board.places };
}

// guide: old editorial records ({name, lat, lng, recommendation, photo}).
// A photo is kept only when it carries a licence (the bundled Commons photos);
// website photos are never copied onto pack places.
export function enrichPlaces(places, guide = []) {
  const extra = new Map();
  for (const record of guide) {
    const note = record.recommendation?.text ? record.recommendation : null;
    const photo = record.photo?.license && record.photo?.url ? record.photo : null;
    if (!note && !photo) continue;
    const hit = sameVenue(record, places);
    if (!hit || extra.has(hit.place.id)) continue;
    extra.set(hit.place.id, { ...(note && { recommendation: note }), ...(photo && { photo }) });
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
