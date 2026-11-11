// Companion names are comma-separated; existing freeform text remains unchanged.
export const companions = value => [...new Set((value || '').split(',').map(s => s.trim()).filter(Boolean))];
const normalized = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
export function memoryOptions(memories) {
  const people = new Map(), places = new Map();
  for (const outing of memories) {
    for (const person of companions(outing.with)) {
      if (!people.has(normalized(person))) people.set(normalized(person), person);
    }
    places.set(outing.place.id, outing.place.name);
  }
  return {
    people: [...people.values()].sort((a,b) => a.localeCompare(b)),
    places: [...places].map(([id,name]) => ({id,name})).sort((a,b) => a.name.localeCompare(b.name)),
    months: [...new Set(memories.map(o => o.visitDate.slice(0,7)))].sort().reverse(),
  };
}
export function filterMemories(memories, {query = '', person = '', place = '', month = ''} = {}) {
  const text = normalized(query.trim());
  return memories.filter(o =>
    (!person || companions(o.with).some(p => normalized(p) === normalized(person))) &&
    (!place || o.place.id === place) &&
    (!month || o.visitDate.startsWith(month)) &&
    (!text || normalized(`${o.place.name} ${o.place.category} ${o.place.address} ${o.notes} ${o.with} ${o.visitDate}`).includes(text))
  ).sort((a,b) => b.visitDate.localeCompare(a.visitDate) || b.updatedAt.localeCompare(a.updatedAt));
}
export function groupMemories(memories) {
  const months = new Map();
  for (const outing of memories) {
    const key = outing.visitDate.slice(0,7);
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(outing);
  }
  return [...months].map(([month, outings]) => ({month, outings}));
}
export function monthLabel(month) {
  return new Date(`${month}-01T12:00:00`).toLocaleDateString(undefined, {month:'long',year:'numeric'});
}
