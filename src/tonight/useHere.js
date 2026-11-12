import { useCallback, useEffect, useRef, useState } from "react";
import { distance } from "../recommendations.js";

// Where the person is, only after they ask (or already allowed it before).
// Ignores jitter under 60 m so the picks do not reshuffle while standing still.
// status: "off" | "asking" | "on" | "denied" | "error"
export default function useHere() {
  const [here, setHere] = useState(null), [status, setStatus] = useState("off");
  const watch = useRef(null), last = useRef(null);
  const start = useCallback(() => {
    if (!navigator.geolocation) { setStatus("error"); return; }
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    setStatus((s) => (s === "on" ? s : "asking"));
    watch.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const point = { lat: coords.latitude, lng: coords.longitude };
        setStatus("on");
        if (last.current && distance(last.current, point) < 0.06) return;
        last.current = point;
        setHere(point);
      },
      (error) => setStatus(error.code === 1 ? "denied" : "error"),
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 15000 },
    );
  }, []);
  useEffect(() => {
    let live = true;
    navigator.permissions?.query({ name: "geolocation" }).then((p) => { if (live && p.state === "granted") start(); }, () => {});
    return () => { live = false; if (watch.current != null) navigator.geolocation.clearWatch(watch.current); };
  }, [start]);
  return { here, status, locate: start };
}
