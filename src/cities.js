let dataset;
const normalize = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();
export async function findCities(query) {
  if (!dataset) {
    const res = await fetch("/cities.json");
    if (!res.ok)
      throw new Error(
        "City search could not load. Check your connection, or use your approximate location.",
      );
    dataset = await res.json();
  }
  const parts = normalize(query).split(/\s+/).filter(Boolean);
  if (!parts.length) return [];
  const results = dataset.filter((r) =>
    parts.every((p) =>
      normalize(`${r[1]} ${r[2]} ${r[3]} ${r[4]}`).includes(p),
    ),
  );
  results.sort(
    (a, b) =>
      (normalize(b[1]) === normalize(query)) -
        (normalize(a[1]) === normalize(query)) || b[7] - a[7],
  );
  return results
    .slice(0, 8)
    .map((r) => ({
      id: r[0],
      name: r[1],
      label: `${r[1]}, ${r[3]}, ${r[4]}`,
      lat: r[5],
      lng: r[6],
    }));
}
