// Original Bordone style over the OpenMapTiles schema. Geographic features are
// unmodified. Illustration is expressed only through paint/layout properties.
const source = (layer) => ({ source: "world", "source-layer": layer });
const name = ["coalesce", ["get", "name:latin"], ["get", "name_en"], ["get", "name"]];
const lineWidth = (small, large) => ["interpolate", ["linear"], ["zoom"], 10, small, 16, large, 20, large * 4];
export function worldStyle(theme="light") {
  const style = {
    version: 8,
    name: "Bordone / Little world",
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: { world: { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> · <a href="https://www.openmaptiles.org">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>' } },
    layers: [
      { id: "paper", type: "background", paint: { "background-color": "#ece8c9" } },
      { id: "neighborhoods", type: "fill", ...source("landuse"), paint: { "fill-color": ["match", ["get", "class"], "residential", "#e6e0bd", "commercial", "#e4d7bb", "industrial", "#ddd6bd", "#e6e2c4"], "fill-opacity": 0.65 } },
      { id: "meadows", type: "fill", ...source("landcover"), filter: ["match", ["get", "class"], ["grass", "wood", "scrub"], true, false], paint: { "fill-color": ["match", ["get", "class"], "wood", "#aebc86", "#c7d59c"], "fill-opacity": 0.85 } },
      { id: "gardens", type: "fill", ...source("park"), paint: { "fill-color": "#bfd29a", "fill-outline-color": "#92ac74" } },
      { id: "garden-edges", type: "line", ...source("park"), paint: { "line-color": "#8aa665", "line-width": 1, "line-dasharray": [2, 3], "line-opacity": 0.7 } },
      { id: "shore", type: "line", ...source("water"), paint: { "line-color": "#87b3ad", "line-width": 6 } },
      { id: "water", type: "fill", ...source("water"), filter: ["!=", ["get", "brunnel"], "tunnel"], paint: { "fill-color": "#a9ceca" } },
      { id: "streams", type: "line", ...source("waterway"), paint: { "line-color": "#98bfb7", "line-width": lineWidth(1, 4) } },
      { id: "building-shadows", type: "fill", ...source("building"), minzoom: 13, paint: { "fill-color": "#bcb18e", "fill-translate": [2, 3], "fill-opacity": 0.55 } },
      { id: "little-buildings", type: "fill", ...source("building"), minzoom: 13, paint: { "fill-color": "#ded1ad", "fill-outline-color": "#bfb38c" } },
      { id: "road-edges", type: "line", ...source("transportation"), filter: ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"], true, false], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#d0c5a1", "line-width": lineWidth(1.8, 8) } },
      { id: "roads", type: "line", ...source("transportation"), filter: ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"], true, false], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#faf3d8", "line-width": lineWidth(0.8, 5.5) } },
      { id: "paths", type: "line", ...source("transportation"), filter: ["match", ["get", "class"], ["path", "track"], true, false], paint: { "line-color": "#b7ab81", "line-width": lineWidth(0.2, 1.5), "line-dasharray": [2, 2] } },
      { id: "rails", type: "line", ...source("transportation"), filter: ["match", ["get", "class"], ["rail", "transit"], true, false], paint: { "line-color": "#aea484", "line-width": 1, "line-dasharray": [4, 3], "line-opacity": 0.6 } },
      { id: "river-names", type: "symbol", ...source("water_name"), layout: { "symbol-placement": "line", "text-field": name, "text-font": ["Noto Sans Italic"], "text-size": 13, "text-letter-spacing": 0.1, "symbol-spacing": 500 }, paint: { "text-color": "#557f79", "text-halo-color": "#c9dfd4", "text-halo-width": 1 } },
      { id: "street-names", type: "symbol", ...source("transportation_name"), minzoom: 14, layout: { "symbol-placement": "line", "text-field": name, "text-font": ["Noto Sans Regular"], "text-size": 10, "symbol-spacing": 350 }, paint: { "text-color": "#877f61", "text-halo-color": "#faf3d8", "text-halo-width": 1.4 } },
      { id: "neighborhood-names", type: "symbol", ...source("place"), filter: ["match", ["get", "class"], ["suburb", "quarter", "neighbourhood"], true, false], minzoom: 12, layout: { "text-field": name, "text-font": ["Noto Sans Regular"], "text-size": 12, "text-letter-spacing": 0.12, "text-transform": "uppercase", "text-max-width": 10 }, paint: { "text-color": "#788260", "text-halo-color": "#ece8c9", "text-halo-width": 2 } },
      { id: "town-names", type: "symbol", ...source("place"), filter: ["match", ["get", "class"], ["city", "town", "village"], true, false], maxzoom: 13, layout: { "text-field": name, "text-font": ["Noto Sans Regular"], "text-size": 17, "text-letter-spacing": 0.06 }, paint: { "text-color": "#506443", "text-halo-color": "#ece8c9", "text-halo-width": 2 } },
    ],
  };
  if(theme==='dark') {
    const colors={"#ece8c9":"#192a26","#e6e0bd":"#243630","#e4d7bb":"#304039","#ddd6bd":"#283933","#e6e2c4":"#22352d","#aebc86":"#274536","#c7d59c":"#304b37","#bfd29a":"#304c39","#92ac74":"#45634b","#8aa665":"#527256","#87b3ad":"#37625f","#a9ceca":"#284e50","#98bfb7":"#3c6564","#bcb18e":"#101e19","#ded1ad":"#3b4940","#bfb38c":"#586052","#d0c5a1":"#45544a","#faf3d8":"#697362","#b7ab81":"#6e7962","#aea484":"#626e5e","#557f79":"#b2d0c7","#c9dfd4":"#284e50","#877f61":"#e6dfc8","#788260":"#b6c5ad","#506443":"#d4dec9"};
    const recolor=value=>Array.isArray(value)?value.map(recolor):colors[value]||value;
    for(const layer of style.layers)for(const key in layer.paint)layer.paint[key]=recolor(layer.paint[key]);
    style.layers.find(layer=>layer.id==="street-names").paint["text-halo-color"]="#192a26";
  }
  return style;
}
