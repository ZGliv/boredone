// Only public directory results live here. The private journal is separate.
const STORAGE_KEY = "boredone-discovery-v1";
export const FRESH_MS = 30 * 60 * 1000;
export const RETAIN_AREA_MS = 30 * 24 * 60 * 60 * 1000;
export const RETAIN_MS = 24 * 60 * 60 * 1000;
export function discoveryKey(area, radius, category) {
  return `${Math.round(area.lat * 100) / 100}:${Math.round(area.lng * 100) / 100}:${Number(radius)}:${category}`;
}
function entries(storage, now) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw || raw.length > 1500000) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(({key, area, result}) => typeof key === "string" && area && Number.isFinite(area.lat) && Number.isFinite(area.lng) && result &&
      Number.isFinite(result.center?.lat) && Number.isFinite(result.center?.lng) &&
      Number.isFinite(Date.parse(result.fetchedAt)) && now - Date.parse(result.fetchedAt) >= 0 && now - Date.parse(result.fetchedAt) < (result.offlineArea ? RETAIN_AREA_MS : RETAIN_MS) &&
      Array.isArray(result.places) && result.places.length <= 800 && result.places.every(p => typeof p.id === "string" && typeof p.name === "string" && Number.isFinite(p.lat) && Number.isFinite(p.lng)) &&
      [1500,3000,5000].includes(result.radius) && ["all","food","culture","outdoors","play"].includes(result.category)).slice(0,12);
  } catch { return []; }
}
function browserStorage() { try { return globalThis.localStorage; } catch { return null; } }
export function readDiscovery(key, storage = browserStorage(), now = Date.now()) {
  const item = entries(storage, now).find(item => !key || item.key === key);
  if (!item) return null;
  return {...item, result:{...item.result, cached:true, restored:true, stale:item.result.stale || now - Date.parse(item.result.fetchedAt) >= FRESH_MS}};
}
export function saveDiscovery(area, result, storage = browserStorage(), now = Date.now()) {
  if (!storage || result.demo || result.sample) return false;
  const key = discoveryKey(area, result.radius, result.category);
  const rows = [{key, area, result}, ...entries(storage,now).filter(item => item.key !== key)].slice(0,12);
  try {
    while (JSON.stringify(rows).length > 1000000) rows.pop();
    storage.setItem(STORAGE_KEY, JSON.stringify(rows)); return true;
  } catch { return false; } // Optional public cache never blocks journal/search.
}
export function clearDiscoveryCache(storage = browserStorage()) { try { storage?.removeItem(STORAGE_KEY); } catch {} }
