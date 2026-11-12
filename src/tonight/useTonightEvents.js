import { useEffect, useState } from "react";
import { eventsQuery, linkEvents } from "./tonightModel.js";

// Tonight's events from /api/events around a point, linked to the city's
// places. Events are a bonus: when the endpoint is missing, slow or failing,
// the list is simply empty and the picks come from saves and places.
export default function useTonightEvents({ center, radiusKm, places }) {
  const [events, setEvents] = useState([]);
  const now = new Date();
  const query = places.length ? eventsQuery({ center, radiusKm, now }) : "";
  // Refetch when the point moves ~1 km or the hour changes, not on every tick.
  const key = query && `${center.lat.toFixed(2)},${center.lng.toFixed(2)},${radiusKm},${now.getDate()}-${now.getHours()},${places.length}`;
  useEffect(() => {
    if (!key || !navigator.onLine) { setEvents((e) => (e.length ? [] : e)); return; }
    const control = new AbortController();
    const timer = setTimeout(() => control.abort(), 12000);
    fetch(`/api/events?${query}`, { signal: control.signal })
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((data) => setEvents(linkEvents(data.events, places)))
      .catch(() => { if (!control.signal.aborted) setEvents((e) => (e.length ? [] : e)); })
      .finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); control.abort(); };
  }, [key]);
  return events;
}
