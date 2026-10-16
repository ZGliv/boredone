import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
export default function Map({ center, places, selected, onSelect }) {
  const root = useRef(null),
    map = useRef(null),
    markers = useRef(null),
    onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  useEffect(() => {
    const instance = L.map(root.current, { scrollWheelZoom: false }).setView(
      [center.lat, center.lng],
      13,
    );
    map.current = instance;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      maxZoom: 19,
    }).addTo(instance);
    markers.current = L.layerGroup().addTo(instance);
    return () => {
      instance.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    map.current?.setView([center.lat, center.lng], 13);
  }, [center.lat, center.lng]);
  useEffect(() => {
    if (!markers.current) return;
    markers.current.clearLayers();
    places.forEach((p, i) => {
      const marker = L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: `place-marker ${selected === p.id ? "selected" : ""}`,
          html: String(i + 1),
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
        title: p.name,
        alt: p.name,
      }).addTo(markers.current);
      const label = document.createElement("span");
      label.textContent = p.name;
      marker.bindTooltip(label);
      marker.on("click", () => onSelectRef.current(p));
    });
  }, [places, selected]);
  return (
    <div
      ref={root}
      className="map"
      role="region"
      aria-label="Map of discovered places. Places are also listed below."
    />
  );
}
