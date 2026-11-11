import { venueGroup } from './venues.js';
import { LANDMARKS, placeKind } from './exploration.js';

// Retain legacy choice IDs; labels describe the actual distance constraint.
export const DISTANCE_CHOICES = [
  { value: '30', label: 'Within 500 m', maxKm: 0.5 },
  { value: '60', label: 'Within 1.5 km', maxKm: 1.5 },
  { value: '120', label: 'Within 3 km', maxKm: 3 },
  { value: 'any', label: 'Anywhere in this area', maxKm: Infinity },
];

// Distance is straight-line from the discovery center, not a route or duration.
// Keep the original places and journal untouched; all ranking stays on-device.
export function rankPlaces(places, outings, category = 'all', time = '60') {
  const choice = DISTANCE_CHOICES.find((item) => item.value === time) || DISTANCE_CHOICES[1];
  const kind = LANDMARKS.find((item) => item.category === category);
  const seen = new Set();
  const ranked = places.filter((place) => {
    if (seen.has(place.id)) return false;
    seen.add(place.id);
    return (!kind || placeKind(place.category) === kind.id) &&
      (choice.maxKm === Infinity || (Number.isFinite(place.distanceKm) && place.distanceKm >= 0 && place.distanceKm <= choice.maxKm));
  }).map((place) => {
    const history = outings.filter((outing) => outing.place.id === place.id);
    const planned = history.some((outing) => outing.status === 'planned');
    const visited = history.some((outing) => outing.status === 'visited');
    return { place, priority: planned ? 0 : visited ? 2 : 1, reason: [
      kind ? kind.label : place.category || 'A nearby idea',
      Number.isFinite(place.distanceKm) ? `${place.distanceKm} km from search center` : 'Distance unknown',
      planned ? 'Already in your plans' : visited ? 'Revisit a memory' : 'Not yet in your memories',
    ].join(' · ') };
  }).sort((a, b) => a.priority - b.priority ||
    (a.place.distanceKm ?? Infinity) - (b.place.distanceKm ?? Infinity) ||
    a.place.id.localeCompare(b.place.id));
  // Greedy variety within each history tier: keep plans first, but avoid three
  // restaurants when a nearby park or museum also fits the user's intent.
  const ordered = [], counts = new Map();
  while (ranked.length) {
    const priority = ranked[0].priority;
    const group = item => category === 'all' ? (venueGroup(item.place.category) || placeKind(item.place.category)) : item.place.category;
    let index = 0;
    for (let i = 1; i < ranked.length && ranked[i].priority === priority; i++) {
      if ((counts.get(group(ranked[i])) || 0) < (counts.get(group(ranked[index])) || 0)) index = i;
    }
    const [next] = ranked.splice(index, 1);
    counts.set(group(next), (counts.get(group(next)) || 0) + 1);
    ordered.push(next);
  }
  return ordered;
}

export function shortlistPlaces(places, outings, category = 'all', time = '60') {
  return rankPlaces(places, outings, category, time).slice(0, 3);
}
