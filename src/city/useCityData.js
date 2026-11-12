import { useEffect, useMemo, useState } from "react";
import { boardProgress } from "../cityBoard.js";
import { CITY_PACKS, DEFAULT_CITY, packById } from "./packs.js";
import { cityFromPack, enrichPlaces, placeStates } from "./cityPlaces.js";

const KEY = "boredone.city";
const loaded = new Map();

function storedCity() {
  try { const id = localStorage.getItem(KEY); return packById(id) ? id : DEFAULT_CITY; } catch { return DEFAULT_CITY; }
}

// Loads (once per session) and prepares a city: pack, closures removed,
// board built, guide notes attached.
export function loadCity(id) {
  if (!loaded.has(id)) {
    const job = Promise.all([packById(id).load(), import("../data/pittsburgh-editorial.json")])
      .then(([pack, guide]) => {
        const data = pack.default || pack;
        const { board, places } = cityFromPack(data);
        return { pack: { id, name: data.shortName || data.city, center: data.center, radiusKm: data.radiusKm, builtAt: data.builtAt, source: data.source, licences: data.licences }, board, places: enrichPlaces(places, (guide.default || guide).places) };
      });
    loaded.set(id, job);
    job.catch(() => loaded.delete(id));
  }
  return loaded.get(id);
}

// The current city, its places and the journal's standing in it.
export default function useCityData(outings) {
  const [cityId, setCityIdState] = useState(storedCity);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState({ id: null, status: "loading", error: "" });
  useEffect(() => {
    let active = true;
    setData((previous) => ({ ...previous, status: "loading", error: "" }));
    loadCity(cityId).then(
      (city) => { if (active) setData({ id: cityId, status: "ready", error: "", ...city }); },
      () => { if (active) setData({ id: cityId, status: "error", error: "Places didn't load" }); },
    );
    return () => { active = false; };
  }, [cityId, attempt]);
  function setCityId(id) {
    if (!packById(id)) return;
    try { localStorage.setItem(KEY, id); } catch { /* Remembering the city is a convenience. */ }
    setCityIdState(id);
  }
  const current = data.id === cityId ? data : {};
  const places = current.places || EMPTY;
  const placeById = useMemo(() => new Map(places.map((place) => [place.id, place])), [places]);
  const states = useMemo(() => placeStates(places, outings), [places, outings]);
  const progress = useMemo(() => (current.board ? boardProgress(current.board, outings) : null), [current.board, outings]);
  return {
    cities: CITY_PACKS.map(({ id, name, center }) => ({ id, name, center })),
    cityId,
    setCityId,
    status: data.id === cityId ? data.status : "loading",
    error: data.id === cityId ? data.error : "",
    retry: () => setAttempt((n) => n + 1),
    city: current.pack || { id: cityId, name: packById(cityId).name, center: packById(cityId).center },
    board: current.board || null,
    places,
    placeById,
    states,
    progress,
  };
}
const EMPTY = [];
