import { useEffect, useMemo, useRef, useState } from "react";
import { decideTonight } from "../decide.js";
import { pickView, tonightContext } from "./tonightModel.js";

// Tonight's Three for the map. The three stay put while you act on them:
// going, saving or marking one done does not reshuffle the list under your
// thumb; the dials, "Not tonight", "Three more", a new location, events
// arriving or the city changing do. (Leaving the map and coming back reads
// the journal afresh.)
export default function useTonight({ cityId, places, saves, outings, ready, here, events }) {
  const [company, setCompany] = useState(null), [energy, setEnergy] = useState(null);
  const [exclude, setExclude] = useState([]), [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6));
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 5 * 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { setExclude([]); }, [cityId]);
  const journal = useRef({ saves, outings });
  journal.current = { saves, outings };
  const hereKey = here ? `${here.lat.toFixed(4)},${here.lng.toFixed(4)}` : "";
  const result = useMemo(() => {
    if (!places.length) return null;
    const { saves: s, outings: o } = journal.current;
    return decideTonight({ saves: s, places, events, outings: o, exclude, seed, context: tonightContext({ now, location: here, companions: company, energy }) });
  }, [places, events, company, energy, exclude, seed, hereKey, now, ready]);
  const picks = useMemo(() => (result ? result.picks.map((pick) => pickView(pick, { location: here })) : []), [result, hereKey]);
  return {
    picks, now,
    company, setCompany: (v) => setCompany((c) => (c === v ? null : v)),
    energy, setEnergy: (v) => setEnergy((e) => (e === v ? null : v)),
    notTonight: (id) => setExclude((list) => [...list, id]),
    more: () => { setExclude((list) => [...new Set([...list, ...picks.map((p) => p.id)])]); setSeed((n) => n + 1); },
  };
}
