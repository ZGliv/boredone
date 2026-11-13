// The camera's trip between two cities. Pure, so it is unit-tested.

export function distanceKm(a, b) {
  const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// Milliseconds: a short glide within a metro, up to 3.6 s between cities, so
// Pittsburgh -> Columbus (about 250 km) takes about 3.4 s.
export function flightMs(km) {
  if (km < 30) return 1400;
  return Math.round(Math.min(3600, 2400 + km * 4));
}

// Web-mercator tile {z, x, y} under a point.
export function tileAt({ lat, lng }, z) {
  const n = 2 ** z, rad = (lat * Math.PI) / 180;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return { z, x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

// The tiles covering the box between two points, at each zoom, padded by
// `pad` tiles on every side: what a flight from a to b will need drawn.
export function tilesBetween(a, b, zooms, pad = 0) {
  const tiles = [];
  for (const z of zooms) {
    const p = tileAt(a, z), q = tileAt(b, z), n = 2 ** z;
    for (let x = Math.max(0, Math.min(p.x, q.x) - pad); x <= Math.min(n - 1, Math.max(p.x, q.x) + pad); x++) {
      for (let y = Math.max(0, Math.min(p.y, q.y) - pad); y <= Math.min(n - 1, Math.max(p.y, q.y) + pad); y++) tiles.push({ z, x, y });
    }
  }
  return tiles;
}
