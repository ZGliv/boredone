import React, { useEffect, useRef, useState } from "react";
import { Map as LibreMap, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { worldStyle, MAP_COLORS } from "../worldStyle.js";
import "./worldMap.css";
setWorkerUrl(workerUrl);

// The city as dots, drawn by the GPU so all of a pack's places stay smooth.
// Gold filled = done, blue ring = on your pile, blue filled = planned, dim =
// not yet. Opens with nothing selected; no zoom buttons, no info icon
// (credits live in Settings).
//   places:     the city's places (useApp().places)
//   states:     Map id -> "done" | "saved" | "planned"
//   center:     {lat, lng} the camera starts on and returns to on city change
//   selectedId: highlighted place id, or null
//   onSelect:   (place | null) => void; null when the map itself is tapped
//   here:       {lat, lng} of the person, or null; drawn as a small ink dot
//   focus:      {lat, lng, key} to bring into view (above `padBottom` px of panel)
const DOT = "#8f8d86";
const toFeatures = (places, states) => ({
  type: "FeatureCollection",
  features: places.map((place) => ({ type: "Feature", properties: { id: place.id, state: states.get(place.id) || "" }, geometry: { type: "Point", coordinates: [place.lng, place.lat] } })),
});

const hereData = (here) => ({ type: "FeatureCollection", features: here ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [here.lng, here.lat] } }] : [] });

export default function WorldMap({ places, states, center, selectedId = null, onSelect, here = null, focus = null, padBottom = 0, className = "" }) {
  const root = useRef(null), map = useRef(null), byId = useRef(new Map()), select = useRef(onSelect);
  const [status, setStatus] = useState("loading"), [attempt, setAttempt] = useState(0);
  const hereRef = useRef(here);
  hereRef.current = here;
  select.current = onSelect;
  byId.current = new Map(places.map((place) => [place.id, place]));

  useEffect(() => {
    if (!navigator.onLine) { setStatus("error"); return; }
    let instance, timer;
    try {
      instance = new LibreMap({ container: root.current, style: worldStyle(), center: [center.lng, center.lat], zoom: 13.2, minZoom: 9, maxZoom: 18.5, attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false, fadeDuration: 0 });
    } catch { setStatus("error"); return; }
    map.current = instance;
    instance.touchZoomRotate.disableRotation();
    timer = setTimeout(() => setStatus((s) => (s === "ready" ? s : "error")), 18000);
    instance.on("sourcedata", (event) => { if (event.sourceId === "world" && event.tile) { clearTimeout(timer); setStatus("ready"); } });
    instance.on("load", () => {
      instance.addSource("places", { type: "geojson", data: toFeatures(places, states), promoteId: "id" });
      const color = ["match", ["get", "state"], "done", "#ffc72c", "planned", "#6cb6ff", "saved", MAP_COLORS.night, DOT];
      // Untouched places first, then yours in their own layer on top, a size
      // up and edged in night, so a gold done never hides under grey dots.
      instance.addLayer({ id: "places-dots", type: "circle", source: "places", filter: ["==", ["get", "state"], ""], paint: {
        "circle-color": DOT, "circle-opacity": 0.55,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 1.6, 14, 3.4, 17, 6],
      } });
      instance.addLayer({ id: "places-marked", type: "circle", source: "places", filter: ["!=", ["get", "state"], ""], paint: {
        "circle-color": color,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.4, 14, 5.2, 17, 8],
        "circle-stroke-color": ["match", ["get", "state"], "saved", "#6cb6ff", MAP_COLORS.night],
        "circle-stroke-width": ["match", ["get", "state"], "saved", 2, 1.4],
      } });
      instance.addLayer({ id: "places-selected", type: "circle", source: "places", filter: ["==", ["get", "id"], ""], paint: {
        "circle-color": ["match", ["get", "state"], "saved", "#6cb6ff", "", "#f5f3ea", color], "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 6, 17, 11],
        "circle-stroke-color": MAP_COLORS.night, "circle-stroke-width": 2.4,
      } });
      instance.addSource("here", { type: "geojson", data: hereData(hereRef.current) });
      instance.addLayer({ id: "here-halo", type: "circle", source: "here", paint: { "circle-color": "#f5f3ea", "circle-opacity": 0.14, "circle-radius": 16 } });
      instance.addLayer({ id: "here-dot", type: "circle", source: "here", paint: { "circle-color": "#f5f3ea", "circle-radius": 5, "circle-stroke-color": MAP_COLORS.night, "circle-stroke-width": 2 } });
      instance.addLayer({ id: "places-hit", type: "circle", source: "places", paint: { "circle-radius": 14, "circle-opacity": 0 } });
      setStatus((s) => s);
      instance.fire("boredone:places");
    });
    instance.on("click", (event) => {
      const hits = instance.getLayer("places-hit") ? instance.queryRenderedFeatures(event.point, { layers: ["places-hit"] }) : [];
      const nearest = hits.map((f) => byId.current.get(f.properties.id)).filter(Boolean)
        .sort((a, b) => dist(instance, event.point, a) - dist(instance, event.point, b))[0];
      select.current?.(nearest || null);
    });
    instance.on("mousemove", "places-hit", () => { instance.getCanvas().style.cursor = "pointer"; });
    instance.on("mouseleave", "places-hit", () => { instance.getCanvas().style.cursor = ""; });
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(root.current);
    return () => { clearTimeout(timer); observer.disconnect(); instance.remove(); map.current = null; };
  }, [attempt]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const apply = () => instance.getSource("places")?.setData(toFeatures(places, states));
    if (instance.getSource("places")) apply(); else instance.once("boredone:places", apply);
  }, [places, states]);
  useEffect(() => {
    map.current?.jumpTo({ center: [center.lng, center.lat], zoom: 13.2 });
  }, [center.lat, center.lng]);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const apply = () => instance.getLayer("places-selected") && instance.setFilter("places-selected", ["==", ["get", "id"], selectedId || ""]);
    if (instance.getLayer("places-selected")) apply(); else instance.once("boredone:places", apply);
  }, [selectedId]);

  useEffect(() => {
    map.current?.getSource("here")?.setData(hereData(here));
  }, [here?.lat, here?.lng]);
  useEffect(() => {
    const instance = map.current;
    if (!instance || !focus) return;
    const box = instance.getContainer().getBoundingClientRect();
    const p = instance.project([focus.lng, focus.lat]);
    const top = 160, bottom = box.height - padBottom - 24;
    if (p.x > 24 && p.x < box.width - 24 && p.y > top && p.y < bottom) return;
    instance.easeTo({ center: [focus.lng, focus.lat], padding: { top, bottom: padBottom, left: 0, right: 0 }, duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450 });
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
