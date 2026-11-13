// Boredone night map over the OpenMapTiles schema (OpenFreeMap tiles).
// Geography is unmodified; the look is paint only. Steel City Blue: neutral
// greys for land and streets, one blue for the rivers and one muted green for
// parks, both kept dark and low in colour, so gold (done), blue (saved) and the
// photo pins are the brightest things on it. Pittsburgh reads as its rivers,
// hills of park and a few lit main roads; districts are named in the app's
// display face, in caps.
const source = (layer) => ({ source: "world", "source-layer": layer });
const name = ["coalesce", ["get", "name:latin"], ["get", "name_en"], ["get", "name"]];
const lineWidth = (small, large) => ["interpolate", ["linear"], ["zoom"], 10, small, 16, large, 20, large * 4];
export const MAP_COLORS = {
  night: "#101010", land: "#141414", park: "#16201a", water: "#1d3242", shore: "#284556", building: "#1b1b1c", edge: "#0d0d0d",
  major: "#3a3a3c", road: "#2b2b2d", minor: "#202022", label: "#a4a29b", quiet: "#68675f", river: "#5d7d92",
};
const c = MAP_COLORS;
// Labels are drawn in the browser from the app's own bundled faces (no glyphs
// URL: MapLibre then rasterises each letter locally once the face has loaded),
// so the map fetches no fonts. Instrument Sans for streets and water,
// Big Shoulders Display for district and town names, as in the rest of the app.
export const LABEL_FONT = ["Instrument Sans Variable"];
export const DISTRICT_FONT = ["Big Shoulders Display"];
export function worldStyle() {
  return {
    version: 8,
    name: "Boredone night",
    sources: { world: { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> · <a href="https://www.openmaptiles.org">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>' } },
    layers: [
      { id: "night", type: "background", paint: { "background-color": c.night } },
      { id: "land", type: "fill", ...source("landuse"), paint: { "fill-color": c.land } },
      { id: "green", type: "fill", ...source("landcover"), filter: ["match", ["get", "class"], ["grass", "wood", "scrub"], true, false], paint: { "fill-color": c.park, "fill-opacity": 0.75 } },
      { id: "parks", type: "fill", ...source("park"), paint: { "fill-color": c.park } },
      { id: "water", type: "fill", ...source("water"), filter: ["!=", ["get", "brunnel"], "tunnel"], paint: { "fill-color": c.water } },
      // A faint lighter shoreline gives the rivers an edge at city zoom.
      { id: "shore", type: "line", ...source("water"), filter: ["!=", ["get", "brunnel"], "tunnel"], minzoom: 11, paint: { "line-color": c.shore, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.6, 16, 1.4] } },
      { id: "streams", type: "line", ...source("waterway"), paint: { "line-color": c.water, "line-width": lineWidth(1, 4) } },
      { id: "buildings", type: "fill", ...source("building"), minzoom: 14, paint: { "fill-color": c.building, "fill-outline-color": c.edge } },
      { id: "minor-roads", type: "line", ...source("transportation"), filter: ["match", ["get", "class"], ["minor", "service", "path", "track"], true, false], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.minor, "line-width": lineWidth(0.5, 4) } },
      { id: "roads", type: "line", ...source("transportation"), filter: ["match", ["get", "class"], ["secondary", "tertiary"], true, false], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.road, "line-width": lineWidth(0.9, 7) } },
      { id: "main-roads", type: "line", ...source("transportation"), filter: ["match", ["get", "class"], ["motorway", "trunk", "primary"], true, false], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.major, "line-width": lineWidth(1.2, 8) } },
      { id: "rails", type: "line", ...source("transportation"), filter: ["match", ["get", "class"], ["rail", "transit"], true, false], paint: { "line-color": c.minor, "line-width": 1, "line-dasharray": [3, 3] } },
      { id: "river-names", type: "symbol", ...source("water_name"), layout: { "symbol-placement": "line", "text-field": name, "text-font": LABEL_FONT, "text-size": 12, "text-letter-spacing": 0.18, "symbol-spacing": 500 }, paint: { "text-color": c.river, "text-halo-color": c.water, "text-halo-width": 1 } },
      { id: "street-names", type: "symbol", ...source("transportation_name"), minzoom: 15, layout: { "symbol-placement": "line", "text-field": name, "text-font": LABEL_FONT, "text-size": 10, "symbol-spacing": 350 }, paint: { "text-color": c.quiet, "text-halo-color": c.night, "text-halo-width": 1.2 } },
      { id: "neighborhood-names", type: "symbol", ...source("place"), filter: ["match", ["get", "class"], ["suburb", "quarter", "neighbourhood"], true, false], minzoom: 11.5, maxzoom: 16, layout: { "text-field": name, "text-font": DISTRICT_FONT, "text-size": ["interpolate", ["linear"], ["zoom"], 12, 13, 15, 17], "text-letter-spacing": 0.12, "text-transform": "uppercase", "text-max-width": 8, "text-padding": 8 }, paint: { "text-color": c.label, "text-opacity": 0.85, "text-halo-color": c.night, "text-halo-width": 1.6 } },
      { id: "town-names", type: "symbol", ...source("place"), filter: ["match", ["get", "class"], ["town", "village"], true, false], maxzoom: 14.5, layout: { "text-field": name, "text-font": DISTRICT_FONT, "text-size": ["interpolate", ["linear"], ["zoom"], 10, 14, 14, 17], "text-letter-spacing": 0.1, "text-transform": "uppercase", "text-padding": 10 }, paint: { "text-color": c.quiet, "text-halo-color": c.night, "text-halo-width": 2 } },
      { id: "city-names", type: "symbol", ...source("place"), filter: ["==", ["get", "class"], "city"], maxzoom: 11, layout: { "text-field": name, "text-font": DISTRICT_FONT, "text-size": 19, "text-letter-spacing": 0.1, "text-transform": "uppercase" }, paint: { "text-color": c.label, "text-halo-color": c.night, "text-halo-width": 2 } },
    ],
  };
}
