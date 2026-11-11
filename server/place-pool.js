import { venueGroup } from '../src/venues.js';
import { placeKind } from '../src/exploration.js';

// Reserve room for each activity family before applying the cache's 120-place
// limit. Input is nearest-first; output stays nearest-first for API consumers.
export function diversePool(places, limit = 120) {
  const groups = new Map();
  for (const place of places) {
    const key = venueGroup(place.category) || placeKind(place.category);
    if (!groups.has(key)) groups.set(key, new Map());
    const kinds = groups.get(key);
    if (!kinds.has(place.category)) kinds.set(place.category, []);
    kinds.get(place.category).push(place);
  }
  // Also preserve rarer venue types within a family (e.g. museums among
  // hundreds of artworks, or cafes among restaurants).
  const queues = [...groups.values()].map(kinds => {
    const queue = [];
    while ([...kinds.values()].some(items => items.length)) {
      for (const items of kinds.values()) if (items.length) queue.push(items.shift());
    }
    return queue;
  });
  const chosen = new Set();
  while (chosen.size < limit) {
    let added = false;
    for (const group of queues) {
      if (group.length && chosen.size < limit) { chosen.add(group.shift()); added = true; }
    }
    if (!added) break;
  }
  return places.filter(place => chosen.has(place));
}
