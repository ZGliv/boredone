import React, { useEffect, useRef, useState } from "react";
import { Map as LibreMap, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { worldStyle, MAP_COLORS } from "../worldStyle.js";
import "./worldMap.css";
setWorkerUrl(workerUrl);

// The city as dots, drawn by the GPU so all of a pack's places stay smooth.
// Gold = done, blue = saved or planned, grey = not yet. Opens with nothing
// selected; no zoom buttons, no info icon (credits live in Settings).
//   places:     the city's places (useApp().places)
//   states:     Map id -> "done" | "saved" | "planned"
//   center:     {lat, lng} the camera starts on and returns to on city change
//   selectedId: highlighted place id, or null
//   onSelect:   (place | null) => void; null when the map itself is tapped
const DOT = "#8f8d86";
const toFeatures = (places, states) => ({
  type: "FeatureCollection",
  features: places.map((place) => ({ type: "Feature", properties: { id: place.id, state: states.get(place.id) || "" }, geometry: { type: "Point", coordinates: [place.lng, place.lat] } })),
});

export default function WorldMap({ places, states, center, selectedId = null, onSelect, className = "" }) {
  const root = useRef(null), map = useRef(null), byId = useRef(new Map()), select = useRef(onSelect);
  const [status, setStatus] = useState("loading"), [attempt, setAttempt] = useState(0);
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
      const color = ["match", ["get", "state"], "done", "#ffc72c", "saved", "#6cb6ff", "planned", "#6cb6ff", DOT];
      const lift = ["match", ["get", "state"], "", 0, 1.2];
      instance.addLayer({ id: "places-dots", type: "circle", source: "places", paint: {
        "circle-color": color,
        "circle-opacity": ["match", ["get", "state"], "", 0.7, 1],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, ["+", 1.6, lift], 14, ["+", 3.4, lift], 17, ["+", 6, lift]],
        "circle-stroke-color": MAP_COLORS.night, "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 12, 0, 15, 1],
      } });
      instance.addLayer({ id: "places-selected", type: "circle", source: "places", filter: ["==", ["get", "id"], ""], paint: {
        "circle-color": color, "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 6, 17, 11],
        "circle-stroke-color": "#f5f3ea", "circle-stroke-width": 2.4,
      } });
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
