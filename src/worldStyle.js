// Boredone night map over the OpenMapTiles schema (OpenFreeMap tiles).
// Geography is unmodified; the look is paint only. Steel City Blue: neutral
// greys for land and streets, one muted blue for water, nothing else with a
// hue, so gold (done) and blue (saved) dots are the brightest things on it.
const source = (layer) => ({ source: "world", "source-layer": layer });
const name = ["coalesce", ["get", "name:latin"], ["get", "name_en"], ["get", "name"]];
const lineWidth = (small, large) => ["interpolate", ["linear"], ["zoom"], 10, small, 16, large, 20, large * 4];
export const MAP_COLORS = { night: "#101010", land: "#131313", park: "#161616", water: "#1c2730", building: "#19191a", edge: "#0c0c0c", road: "#262628", minor: "#1f1f21", label: "#8f8d86", quiet: "#5f5e5a" };
const c = MAP_COLORS;
export function worldStyle() {
  return {
    version: 8,
    name: "Boredone night",
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: { world: { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> · <a href="https://www.openmaptiles.org">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>' } },
    layers: [
      { id: "night", type: "background", paint: { "background-color": c.night } },
      { id: "land", type: "fill", ...source("landuse"), paint: { "fill-color": c.land } },
      { id: "parks", type: "fill", ...source("park"), paint: { "fill-color": c.park } },
      { id: "green", type: "fill", ...source("landcover"), filter: ["match", ["get", "class"], ["grass", "wood", "scrub"], true, false], paint: { "fill-color": c.park } },
      { id: "water", type: "fill", ...source("water"), filter: ["!=", ["get", "brunnel"], "tunnel"], paint: { "fill-color": c.water } },
      { id: "streams", type: "line", ...source("waterway"), paint: { "line-color": c.water, "line-width": lineWidth(1, 4) } },
      { id: "buildings", type: "fill", ...source("building"), minzoom: 14, paint: { "fill-color": c.building, "fill-outline-color": c.edge } },
      { id: "minor-roads", type: "line", ...source("transportation"), filter: ["match", ["get", "class"], ["minor", "service", "path", "track"], true, false], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.minor, "line-width": lineWidth(0.5, 4) } },
      { id: "roads", type: "line", ...source("transportation"), filter: ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary"], true, false], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.road, "line-width": lineWidth(0.9, 7) } },
      { id: "rails", type: "line", ...source("transportation"), filter: ["match", ["get", "class"], ["rail", "transit"], true, false], paint: { "line-color": c.minor, "line-width": 1, "line-dasharray": [3, 3] } },
      { id: "river-names", type: "symbol", ...source("water_name"), layout: { "symbol-placement": "line", "text-field": name, "text-font": ["Noto Sans Italic"], "text-size": 12, "text-letter-spacing": 0.12, "symbol-spacing": 500 }, paint: { "text-color": c.quiet, "text-halo-color": c.water, "text-halo-width": 1 } },
      { id: "street-names", type: "symbol", ...source("transportation_name"), minzoom: 15, layout: { "symbol-placement": "line", "text-field": name, "text-font": ["Noto Sans Regular"], "text-size": 10, "symbol-spacing": 350 }, paint: { "text-color": c.quiet, "text-halo-color": c.night, "text-halo-width": 1.2 } },
      { id: "neighborhood-names", type: "symbol", ...source("place"), filter: ["match", ["get", "class"], ["suburb", "quarter", "neighbourhood"], true, false], minzoom: 12, layout: { "text-field": name, "text-font": ["Noto Sans Regular"], "text-size": 11, "text-letter-spacing": 0.14, "text-transform": "uppercase", "text-max-width": 9 }, paint: { "text-color": c.label, "text-halo-color": c.night, "text-halo-width": 1.6 } },
      { id: "town-names", type: "symbol", ...source("place"), filter: ["match", ["get", "class"], ["city", "town", "village"], true, false], maxzoom: 12, layout: { "text-field": name, "text-font": ["Noto Sans Regular"], "text-size": 15, "text-letter-spacing": 0.08 }, paint: { "text-color": c.label, "text-halo-color": c.night, "text-halo-width": 2 } },
    ],
  };
}
