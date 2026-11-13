import React, { useEffect, useRef, useState } from "react";
import { Map as LibreMap, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { worldStyle, MAP_COLORS, LABEL_FONT, DISTRICT_FONT } from "../worldStyle.js";
import { drawBadge, drawPhotoPin } from "./badges.js";
import { distanceKm, flightMs, tilesBetween } from "./flight.js";
import { DISTRICT_BANDS, districtFeatures, placeFeatures } from "./markers.js";
import "./worldMap.css";
setWorkerUrl(workerUrl);

// The city as round photo pins and kind badges, drawn by the GPU so a
// 5,000-place pack stays smooth. A place with a photo (place.mapPhoto) is a
// round photo pin: cream ring, gold when done, blue when on your pile. The rest
// are cream kind badges, gold and blue the same way. The pins that matter most
// win collisions (markers.js); photo pins may touch a little, never pile up,
// and the rest show as small dots until you zoom in. Badges paint at once;
// photo pins replace them when the one photo atlas has decoded (the service
// worker precaches it). Opens with nothing selected; no zoom buttons, no info
// icon (credits live in Settings).
//   places:     the city's places (useApp().places); [] while a city loads
//   states:     Map id -> "done" | "saved" | "planned"
//   cityId:     a new id flies the camera to `center`
//   center:     {lat, lng} of the city
//   selectedId: highlighted place id, or null
//   onSelect:   (place | null) => void; null when the map itself is tapped
//   here:       {lat, lng} of the person, or null; drawn as a small ink dot
//   focus:      {lat, lng, key} to bring into view (between `padTop` and `padBottom` px)
//   warmTo:     [{lat, lng}] cities the camera may fly to next (the city sheet
//               is open); their widest tiles are fetched ahead, the rest when
//               the flight starts, so it never crosses an empty map
const CITY_ZOOM = 13.2;
const MIN_ZOOM = 9;
const EDGE = 64;
const DOT = "#8f8d86";
const tone = (done, saved, none) => ["match", ["get", "tone"], "done", done, "saved", saved, none];
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const PIXEL_RATIO = () => Math.max(2, Math.ceil(devicePixelRatio || 1));
const withPhoto = [">=", ["get", "photo"], 0];
const badgeImage = (kind) => ["concat", `${kind}:`, ["get", "icon"], ":", ["get", "tone"]];
const photoImage = (kind) => ["concat", `${kind}:`, ["to-string", ["get", "photo"]], ":", ["get", "tone"]];
// Photo pins once the atlas is ready, kind badges until then (and for places without one).
const iconImage = (ready, selected = false) => (ready
  ? ["case", withPhoto, photoImage(selected ? "pickphoto" : "photo"), badgeImage(selected ? "pick" : "badge")]
  : badgeImage(selected ? "pick" : "badge"));
// At street zoom only the pins that matter most (done, saved, photo: rank < 3)
// get a name; every pin does once you are right in close.
const pinLabel = ["step", ["zoom"], "", 15.6, ["case", ["<", ["get", "rank"], 3], ["get", "name"], ""], 17.4, ["get", "name"]];

// An opacity that drops to 0 for a feature marked as cut off by the screen edge.
const unlessEdge = (opacity) => ["case", ["boolean", ["feature-state", "edge"], false], 0, opacity];
const PIN_LAYERS = [["places-badges", ["==", ["get", "tone"], "none"]], ["places-mine", ["!=", ["get", "tone"], "none"]]];
// A layer of photo pins and kind badges; "places-mine" holds done and saved.
// Photo pins may overlap each other a little at city zoom (negative collision
// padding), so more of the city's photos show without piling into a blob;
// plain badges keep more room, so the photos lead. Collision is shared across
// both pin layers.
function pinLayer(id, filter, ready) {
  const mine = id === "places-mine";
  return { id, type: "symbol", source: "places", minzoom: 10, filter, layout: {
    "icon-image": iconImage(ready),
    "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 12.5, ["case", withPhoto, 0.84, 0.82], 14.5, ["case", withPhoto, 0.94, 1], 17, ["case", withPhoto, 1, 1.12]],
    "icon-padding": ["interpolate", ["linear"], ["zoom"], 11, ["case", withPhoto, -10, 12], 13.5, ["case", withPhoto, -9, 8], 15, ["case", withPhoto, -3, 4], 16, ["case", withPhoto, 0, 2]],
    // Yours always show, even touching each other, done drawn over saved;
    // the rest give way by rank (markers.js).
    ...(mine ? { "icon-allow-overlap": true, "symbol-sort-key": ["-", 0, ["get", "rank"]] } : { "symbol-sort-key": ["get", "rank"] }),
    "text-field": pinLabel,
    "text-font": LABEL_FONT,
    "text-size": 11.5,
    "text-max-width": 7.5,
    "text-line-height": 1.15,
    "text-optional": true,
    "text-variable-anchor": ["left", "right"],
    "text-radial-offset": ["case", withPhoto, 2.35, 1.35],
    "text-justify": "auto",
    "text-padding": 2,
  }, paint: {
    "text-color": tone("#ffd866", "#9dceff", "#c9c6bc"),
    // A name whose pin sits at the screen edge would be cut off: hidden (see the idle pass).
    "text-opacity": unlessEdge(1),
    "text-halo-color": MAP_COLORS.night, "text-halo-width": 1.4, "text-halo-blur": 0.4,
  } };
}

// One decode per atlas URL for the session; the map may remount.
const atlases = new Map();
function loadAtlas(url) {
  if (!atlases.has(url)) {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    const job = image.decode().then(() => image);
    job.catch(() => atlases.delete(url));
    atlases.set(url, job);
  }
  return atlases.get(url);
}

const hereData = (here) => ({ type: "FeatureCollection", features: here ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [here.lng, here.lat] } }] : [] });

export default function WorldMap({ places, states, cityId = "", center, selectedId = null, onSelect, here = null, focus = null, warmTo = null, padTop = 72, padBottom = 0, className = "" }) {
  const root = useRef(null), map = useRef(null), byId = useRef(new Map()), select = useRef(onSelect);
  const [status, setStatus] = useState("loading"), [attempt, setAttempt] = useState(0);
  const hereRef = useRef(here);
  // What the map shows: the current city's places, plus the last city's while
  // the camera is still flying away from it.
  const shown = useRef({ cityId, places: [], states: new Map(), leaving: null });
  const flight = useRef(null), cameraCity = useRef(cityId), warmed = useRef(new Set());
  // The decoded photo atlas: {url, image, columns, rows}; image is null until ready.
  const atlas = useRef(null);
  hereRef.current = here;
  select.current = onSelect;

  function paint() {
    const instance = map.current, source = instance?.getSource("places");
    if (!source) return;
    const { places: now, states: marks, leaving } = shown.current;
    const all = leaving ? [...leaving.places, ...now] : now;
    byId.current = new Map(all.map((place) => [place.id, place]));
    const features = placeFeatures(now, marks);
    if (leaving) features.features.unshift(...placeFeatures(leaving.places, leaving.states).features);
    source.setData(features);
    instance.getSource("districts")?.setData(districtFeatures(now));
    const sheet = all.find((place) => place.mapPhoto?.atlas)?.mapPhoto;
    if (sheet) showAtlas(sheet);
  }

  // Decode the atlas off the main path; badges stand in until it is ready.
  function showAtlas({ atlas: url, columns, rows }) {
    if (atlas.current?.url === url) return;
    atlas.current = { url, columns, rows, image: null };
    loadAtlas(url).then((image) => {
      if (atlas.current?.url !== url) return;
      atlas.current = { ...atlas.current, image };
      const instance = map.current;
      if (!instance?.getLayer("places-badges")) return;
      for (const [id] of PIN_LAYERS) instance.setLayoutProperty(id, "icon-image", iconImage(true));
      instance.setLayoutProperty("places-pick", "icon-image", iconImage(true, true));
    }, () => { /* No photos: the kind badges stay, which is a complete map. */ });
  }

  // Fetch tiles into the HTTP cache (OpenFreeMap tiles are immutable), so
  // MapLibre's own requests for them later return at once.
  function warm(tiles) {
    const template = map.current?.getSource("world")?.tiles?.[0];
    if (!template || !navigator.onLine) return;
    for (const { z, x, y } of tiles) {
      const url = template.replace("{z}", z).replace("{x}", x).replace("{y}", y);
      if (warmed.current.has(url)) continue;
      warmed.current.add(url);
      fetch(url, { cache: "force-cache" }).catch(() => warmed.current.delete(url));
    }
  }

  useEffect(() => {
    if (!navigator.onLine) { setStatus("error"); return; }
    let instance, timer;
    try {
      instance = new LibreMap({ container: root.current, style: worldStyle(), center: [center.lng, center.lat], zoom: CITY_ZOOM, minZoom: MIN_ZOOM, maxZoom: 18.5, attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false, fadeDuration: 160 });
    } catch { setStatus("error"); return; }
    map.current = instance;
    cameraCity.current = cityId;
    instance.touchZoomRotate.disableRotation();
    timer = setTimeout(() => setStatus((s) => (s === "ready" ? s : "error")), 18000);
    instance.on("sourcedata", (event) => { if (event.sourceId === "world" && event.tile) { clearTimeout(timer); setStatus("ready"); } });
    // Badge and photo pin images are drawn the first time a layer asks for one.
    instance.setMissingStyleImageResolver((id) => {
      if (instance.hasImage(id)) return;
      const ratio = PIXEL_RATIO();
      const drawn = drawBadge(id, ratio) || drawPhotoPin(id, ratio, atlas.current);
      if (drawn) instance.addImage(id, drawn.image, { pixelRatio: drawn.pixelRatio });
    });
    instance.on("load", () => {
      instance.addSource("places", { type: "geojson", data: { type: "FeatureCollection", features: [] }, promoteId: "id" });
      // Every place as a quiet dot; a badge, where one fits, sits on top.
      instance.addLayer({ id: "places-dots", type: "circle", source: "places", paint: {
        "circle-color": tone("#ffc72c", "#6cb6ff", DOT),
        "circle-opacity": tone(0.95, 0.95, 0.42),
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 0.7, 10, 1.3, 13, 2, 16, 2.6],
      } });
      const ready = !!atlas.current?.image;
      // Two pin layers: yours (done, saved) above the rest, so where pins
      // touch, yours is drawn on top and is placed first.
      for (const [id, filter] of PIN_LAYERS) instance.addLayer(pinLayer(id, filter, ready));
      // District names from the places' own neighbourhoods. They sit between
      // your pins and the rest: yours always show, names come next and the
      // other pins make room for them; markers.js spaces the names by zoom.
      instance.addSource("districts", { type: "geojson", data: { type: "FeatureCollection", features: [] }, promoteId: "name" });
      for (const band of DISTRICT_BANDS) instance.addLayer({ id: `districts-${band}`, type: "symbol", source: "districts", minzoom: band - 0.4, maxzoom: 15.8, filter: ["==", ["get", "band"], band], layout: {
        "text-field": ["get", "name"], "text-font": DISTRICT_FONT, "text-transform": "uppercase", "text-letter-spacing": 0.12,
        "text-size": ["interpolate", ["linear"], ["zoom"], 12, 13, 15, 17], "text-max-width": 7, "text-line-height": 1,
        "text-padding": 4,
      }, paint: { "text-color": MAP_COLORS.label, "text-opacity": ["interpolate", ["linear"], ["zoom"], band - 0.4, 0, band, unlessEdge(0.7), 15.4, unlessEdge(0.7), 15.8, 0], "text-halo-color": MAP_COLORS.night, "text-halo-width": 1.6 } }, "places-mine");
      instance.addSource("here", { type: "geojson", data: hereData(hereRef.current) });
      instance.addLayer({ id: "here-halo", type: "circle", source: "here", paint: { "circle-color": "#f5f3ea", "circle-opacity": 0.14, "circle-radius": 16 } });
      instance.addLayer({ id: "here-dot", type: "circle", source: "here", paint: { "circle-color": "#f5f3ea", "circle-radius": 5, "circle-stroke-color": MAP_COLORS.night, "circle-stroke-width": 2 } });
      // The selected place: a larger badge with a cream ring and its name,
      // always drawn, pushing neighbouring badges out of its way.
      instance.addLayer({ id: "places-pick", type: "symbol", source: "places", filter: ["==", ["get", "id"], ""], layout: {
        "icon-image": iconImage(ready, true),
        "icon-allow-overlap": true,
        "text-field": ["get", "name"],
        "text-font": LABEL_FONT,
        "text-size": 14,
        "text-max-width": 9,
        "text-line-height": 1.15,
        "text-variable-anchor": ["left", "right"],
        "text-radial-offset": ["case", withPhoto, 2.95, 1.95],
        "text-justify": "auto",
        "text-allow-overlap": true,
      }, paint: { "text-color": "#f5f3ea", "text-halo-color": MAP_COLORS.night, "text-halo-width": 1.8 } });
      paint();
      instance.fire("boredone:places");
    });
    instance.on("click", (event) => {
      if (!instance.getLayer("places-badges")) return;
      // The badge you can see is the target; its tap area is larger than it is.
      const hit = (layers, r) => instance.queryRenderedFeatures([[event.point.x - r, event.point.y - r], [event.point.x + r, event.point.y + r]], { layers })
        .map((f) => byId.current.get(f.properties.id)).filter(Boolean)
        .sort((a, b) => dist(instance, event.point, a) - dist(instance, event.point, b))[0];
      select.current?.(hit(["places-pick", "places-mine", "places-badges"], 22) || hit(["places-dots"], 12) || null);
    });
    for (const layer of ["places-badges", "places-mine", "places-pick"]) {
      instance.on("mousemove", layer, () => { instance.getCanvas().style.cursor = "pointer"; });
      instance.on("mouseleave", layer, () => { instance.getCanvas().style.cursor = ""; });
    }
    // Names are drawn only at street zoom. A pin within EDGE px of the left or
    // right edge (or past it) would show a name cut off by the screen, so its
    // name is hidden until the map moves it inward. MapLibre's placement does
    // not know the screen edge, hence this pass after each render settles.
    let edged = new Set(), cutDistricts = new Set();
    instance.on("idle", () => {
      if (!instance.getLayer("places-badges")) return;
      const next = new Set();
      if (instance.getZoom() >= 15.5) {
        const width = instance.getContainer().clientWidth;
        for (const f of instance.queryRenderedFeatures({ layers: ["places-badges", "places-mine"] })) {
          const place = byId.current.get(f.properties.id);
          if (!place) continue;
          const { x } = instance.project([place.lng, place.lat]);
          if (x < EDGE || x > width - EDGE) next.add(place.id);
        }
      }
      for (const id of edged) if (!next.has(id)) instance.setFeatureState({ source: "places", id }, { edge: false });
      for (const id of next) if (!edged.has(id)) instance.setFeatureState({ source: "places", id }, { edge: true });
      edged = next;
      // District names likewise, by an estimate of their width (caps, wrapped at about 12 letters).
      const width = instance.getContainer().clientWidth, size = 13 + (Math.min(Math.max(instance.getZoom(), 12), 15) - 12) * (4 / 3);
      const cut = new Set();
      for (const f of instance.querySourceFeatures("districts")) {
        const [lng, lat] = f.geometry.coordinates, half = (Math.min(f.properties.name.length, 12) * size * 0.62) / 2;
        const { x } = instance.project([lng, lat]);
        if (x - half < 4 || x + half > width - 4) cut.add(f.properties.name);
      }
      for (const name of cutDistricts) if (!cut.has(name)) instance.setFeatureState({ source: "districts", id: name }, { edge: false });
      for (const name of cut) if (!cutDistricts.has(name)) instance.setFeatureState({ source: "districts", id: name }, { edge: true });
      cutDistricts = cut;
    });
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(root.current);
    return () => { clearTimeout(timer); observer.disconnect(); instance.remove(); map.current = null; };
  }, [attempt]);

  // New places replace the shown ones. While a city loads (places is []) the
  // last city stays on the map; while the camera flies away from it, both do.
  useEffect(() => {
    const current = shown.current;
    if (!places.length && current.places.length) return;
    if (current.cityId !== cityId && current.places.length && flight.current) {
      shown.current = { cityId, places, states, leaving: { places: current.places, states: current.states } };
    } else {
      shown.current = { cityId, places, states, leaving: current.cityId === cityId ? current.leaving : null };
    }
    const instance = map.current;
    if (instance?.getSource("places")) paint();
  }, [places, states, cityId]);

  // A new city: fly out of the old one and into it (or jump, for reduced motion).
  useEffect(() => {
    const instance = map.current;
    if (!instance || !center) return;
    const from = cameraCity.current;
    cameraCity.current = cityId;
    const to = [center.lng, center.lat];
    if (from === cityId) {
      if (instance.loaded() && !flight.current) instance.jumpTo({ center: to, zoom: CITY_ZOOM });
      return;
    }
    instance.stop();
    const land = () => {
      flight.current = null;
      instance.setMinZoom(MIN_ZOOM);
      if (shown.current.leaving) { shown.current = { ...shown.current, leaving: null }; paint(); }
    };
    if (reducedMotion()) { instance.jumpTo({ center: to, zoom: CITY_ZOOM }); land(); return; }
    const here = instance.getCenter(), km = distanceKm(here, center);
    warm([...tilesBetween(here, center, [5, 6]), ...tilesBetween(here, center, [7, 8], 1), ...tilesBetween(center, center, [12, 13], 1)]);
    const token = {};
    flight.current = token;
    instance.setMinZoom(3);
    instance.flyTo({ center: to, zoom: CITY_ZOOM, curve: 1.5, duration: flightMs(km), essential: true });
    instance.once("moveend", () => { if (flight.current === token) land(); });
  }, [cityId, center?.lat, center?.lng]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !warmTo?.length) return;
    const here = instance.getCenter();
    warm(warmTo.flatMap((to) => tilesBetween(here, to, [5, 6])));
  }, [warmTo]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    // The selected place leaves the badge layer so its label is not drawn twice.
    const apply = () => {
      if (!instance.getLayer("places-pick")) return;
      instance.setFilter("places-pick", ["==", ["get", "id"], selectedId || ""]);
      for (const [id, filter] of PIN_LAYERS) instance.setFilter(id, selectedId ? ["all", filter, ["!=", ["get", "id"], selectedId]] : filter);
    };
    if (instance.getLayer("places-pick")) apply(); else instance.once("boredone:places", apply);
  }, [selectedId]);

  useEffect(() => {
    map.current?.getSource("here")?.setData(hereData(here));
  }, [here?.lat, here?.lng]);
  useEffect(() => {
    const instance = map.current;
    if (!instance || !focus || flight.current) return;
    const box = instance.getContainer().getBoundingClientRect();
    const p = instance.project([focus.lng, focus.lat]);
    const bottom = box.height - padBottom - 24;
    if (p.x > 24 && p.x < box.width - 24 && p.y > padTop && p.y < bottom) return;
    instance.easeTo({ center: [focus.lng, focus.lat], padding: { top: padTop, bottom: padBottom, left: 0, right: 0 }, duration: reducedMotion() ? 0 : 450 });
  }, [focus?.key]);

  return (
    <div className={`world-map ${className}`}>
      <div ref={root} className="world-map-canvas" role="region" aria-label={`Map, ${places.length.toLocaleString()} places`} />
      {status === "error" && (
        <div className="world-map-offline" role="status">
          <span>Map offline</span>
          <button type="button" onClick={() => { setStatus("loading"); setAttempt((n) => n + 1); }}>Retry</button>
        </div>
      )}
    </div>
  );
}
function dist(instance, point, place) {
  const p = instance.project([place.lng, place.lat]);
  return (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
}
