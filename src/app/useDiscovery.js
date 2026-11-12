import { useEffect, useRef, useState } from "react";
import { discoveryKey, readDiscovery, saveDiscovery } from "../discoveryCache";
import { preloadedDiscovery, bundledArea, enrichBundledArea, CORRIDOR_AREA } from "../preloaded";
import { mergeEditorial } from "../recommendations";
import { findPlaces, findEditorial } from "../findPlaces";
import { sampleResult } from "../sample";
import { findCities } from "../cities";
import { START_CITY } from "./routes";

// The Find page's area, search results, selection and map controls.
export default function useDiscovery(demoMode) {
  const [restoredDiscovery] = useState(() => preloadedDiscovery(readDiscovery()));
  const [city, setCity] = useState(restoredDiscovery?.area || START_CITY),
    [cityText, setCityText] = useState(restoredDiscovery?.area.name || "Pittsburgh"),
    [cityMatches, setCityMatches] = useState(null),
    [cityBusy, setCityBusy] = useState(false),
    [cityError, setCityError] = useState(""),
    [category, setCategory] = useState("all"),
    [radius, setRadius] = useState(String(restoredDiscovery?.result.radius || 3000)),
    [result, setResult] = useState(restoredDiscovery?.result || null),
    [searchBusy, setSearchBusy] = useState(false),
    [searchPhase, setSearchPhase] = useState(""),
    [searchError, setSearchError] = useState(""),
    [selected, setSelected] = useState(null),
    [geoBusy, setGeoBusy] = useState(false),
    [mapVisible, setMapVisible] = useState(true),
    [mapLayer, setMapLayer] = useState("discover");
  const request = useRef(0),
    searchAbort = useRef(null);
  useEffect(() => () => searchAbort.current?.abort(), []);
  async function searchCities(e) {
    e.preventDefault();
    setCityBusy(true);
    setCityMatches(null);
    setCityError("");
    try {
      const matches = await findCities(cityText);
      setCityMatches(matches);
    } catch (e) {
      setCityError(e.message);
    } finally {
      setCityBusy(false);
    }
  }
  async function searchPlaces(area = city, force = false, offlineArea = false, requestedRadius = radius) {
    if (demoMode) { setResult(sampleResult()); setMapLayer("discover"); setSelected(null); return; }
    const key = discoveryKey(area, requestedRadius, "all");
    const saved = readDiscovery(key) || (!navigator.onLine ? readDiscovery(discoveryKey(area, requestedRadius, category)) : null);
    const id = ++request.current;
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setSearchBusy(true);
    setMapLayer("discover");
    setSelected(null);
    setSearchError("");
    if (saved) setResult(saved.result);
    if (saved && ((!saved.result.stale && saved.result.poolVersion === 3) || !navigator.onLine) && !force) { setSearchBusy(false); return; }
    try {
      const data = await findPlaces({ lat: area.lat, lng: area.lng, radius: requestedRadius, category: "all" }, {
        signal: controller.signal, areaOnly: offlineArea,
        onPhase: (phase) => { if (id === request.current) setSearchPhase(phase); },
      });
      if (id === request.current) {
        let next = enrichBundledArea(area, {...data, cityLabel: area.label, cityName: area.name, category: "all", poolVersion: 3});
        setResult(next);
        saveDiscovery(area, next);
        // The base guide is usable immediately; enrichment has its own deadline.
        setSearchBusy(false);
        setSearchPhase("");
        try {
          const editorial = await findEditorial({lat:area.lat,lng:area.lng,radius:requestedRadius,city:area.name}, {signal:controller.signal});
          if (id === request.current) { next = {...next, places:mergeEditorial(next.places,editorial.places),editorialAt:editorial.fetchedAt}; setResult(next);saveDiscovery(area,next); }
        } catch { /* Keep the usable base guide during enrichment outages. */ }
      }
    } catch (e) {
      if (e.name !== "AbortError" && id === request.current) {
        setSearchError(e.name === "TimeoutError" ? "Search timed out. Your previously found places are still available; try again or narrow the area." : e.message);
        setResult(previous => previous ? {...previous, stale:true} : previous);
      }
    } finally {
      if (id === request.current) { setSearchBusy(false); setSearchPhase(""); }
    }
  }
  function invalidateSearch(preserveResults = false) {
    setSelected(null);
    request.current++;
    searchAbort.current?.abort();
    setSearchBusy(false);
    if (!preserveResults) setResult(null);
    setSearchError("");
  }
  function chooseCity(area) {
    setCategory("all");
    setSelected(null);
    setMapLayer("discover");
    request.current++;
    searchAbort.current?.abort();
    setSearchBusy(false);
    setResult(bundledArea(area, radius));
    setCity(area);
    setCityText(area.name);
    setCityMatches(null);
    setSearchError("");
    searchPlaces(area);
  }
  function chooseCorridor() {
    invalidateSearch();setMapLayer('discover');setCategory('all');setRadius('5000');setCity(CORRIDOR_AREA);setCityText(CORRIDOR_AREA.name);setCityMatches(null);const next=bundledArea(CORRIDOR_AREA,5000);setResult(next);saveDiscovery(CORRIDOR_AREA,next);
  }
  function geolocate() {
    if (!navigator.geolocation) {
      setSearchError(
        "Location is not available. Search for a nearby city instead.",
      );
      return;
    }
    setGeoBusy(true);
    setSearchError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        chooseCity({
          name: "Your area",
          label: "Your approximate area",
          lat: Math.round(pos.coords.latitude * 100) / 100,
          lng: Math.round(pos.coords.longitude * 100) / 100,
        });
        setGeoBusy(false);
      },
      () => {
        setGeoBusy(false);
        setSearchError(
          "Location was not available. Search by city to explore without sharing your location.",
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }
  // Demo mode swaps in fictional places; leaving it restores the saved area.
  function enterDemoArea() {
    invalidateSearch();
    setCategory("all");
    setMapLayer("discover");
    setResult(sampleResult());
  }
  function leaveDemoArea() {
    invalidateSearch();
    setMapLayer("discover");
    setCategory("all");
    const saved = preloadedDiscovery(readDiscovery());
    if (saved) { setResult(saved.result); setCity(saved.area); setCityText(saved.area.name); setCategory(saved.result.category); setRadius(String(saved.result.radius)); }
  }
  return {
    city, cityText, setCityText, cityMatches, cityBusy, cityError, geoBusy,
    category, setCategory, radius, setRadius, result, setResult,
    searchBusy, searchPhase, searchError, setSearchError,
    selected, setSelected, mapVisible, setMapVisible, mapLayer, setMapLayer,
    searchCities, searchPlaces, chooseCity, chooseCorridor, geolocate,
    enterDemoArea, leaveDemoArea,
  };
}
