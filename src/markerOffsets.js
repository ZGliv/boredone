// Keep co-located businesses individually selectable without changing the
// coordinates used for directions. Only near-identical pins are spread apart.
export function markerOffsets(places) {
  const groups = new Map();
  for (const place of places) {
    const key = `${place.lat.toFixed(5)},${place.lng.toFixed(5)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(place.id);
  }
  const offsets = new Map();
  for (const ids of groups.values()) {
    ids.sort();
    if (ids.length === 1) { offsets.set(ids[0], [0, 0]); continue; }
    const radius = Math.max(38, 38 / Math.sin(Math.PI / ids.length));
    ids.forEach((id, i) => {
      const angle = Math.PI * 2 * i / ids.length;
      offsets.set(id, [Math.round(radius * Math.cos(angle)) || 0, Math.round(radius * Math.sin(angle)) || 0]);
    });
  }
  return offsets;
}
