import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Editor, { Modal } from "./Editor";
import Map from "./Map";
import { findCities } from "./cities";
import { readLibrary, writeLibrary } from "./storage";
import {
  backupPayload,
  blankLibrary,
  displayDate,
  localDate,
  makeOuting,
  MAX_BACKUP_BYTES,
  mergeOutings,
  validateBackup,
} from "./model";
import "./styles.css";

const START_CITY = {
  name: "Pittsburgh",
  label: "Pittsburgh, Pennsylvania, US",
  lat: 40.44062,
  lng: -79.99589,
};
const TABS = [
  ["find", "Find it"],
  ["plans", "Do it"],
  ["memories", "Remember"],
];
function pageFromHash() {
  const value = location.hash.slice(1);
  return [...TABS.map((t) => t[0]), "settings"].includes(value)
    ? value
    : "find";
}
function download(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  if (blob.size > MAX_BACKUP_BYTES)
    throw new Error(
      "This backup exceeds 50 MB. Remove unused photos before exporting.",
    );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `boredone-backup-${localDate()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function directions(place) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.lat != null ? `${place.lat},${place.lng}` : place.name + " " + place.address)}`;
}
function App() {
  const [page, setPage] = useState(pageFromHash),
    [library, setLibrary] = useState(blankLibrary),
    [ready, setReady] = useState(false),
    [storageError, setStorageError] = useState(""),
    [message, setMessage] = useState("");
  const [city, setCity] = useState(START_CITY),
    [cityText, setCityText] = useState("Pittsburgh"),
    [cityMatches, setCityMatches] = useState(null),
    [cityBusy, setCityBusy] = useState(false),
    [category, setCategory] = useState("all"),
    [radius, setRadius] = useState("3000"),
    [result, setResult] = useState(null),
    [searchBusy, setSearchBusy] = useState(false),
    [searchError, setSearchError] = useState(""),
    [selected, setSelected] = useState(null),
    [editor, setEditor] = useState(null),
    [importing, setImporting] = useState(null),
    [importBusy, setImportBusy] = useState(false),
    [query, setQuery] = useState(""),
    [geoBusy, setGeoBusy] = useState(false),
    [memoryDetail, setMemoryDetail] = useState(null),
    [mapVisible, setMapVisible] = useState(true);
  const libraryRef = useRef(library),
    request = useRef(0),
    searchAbort = useRef(null),
    noticeRef = useRef(null);
  libraryRef.current = library;
  async function load() {
    try {
      const data = await readLibrary();
      setLibrary(data);
      setReady(true);
      setStorageError("");
    } catch (e) {
      setStorageError(e.message);
    }
  }
  useEffect(() => {
    load();
    const handler = () => setPage(pageFromHash());
    window.addEventListener("hashchange", handler);
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("boredone-journal")
        : null;
    if (channel) channel.onmessage = load;
    return () => {
      window.removeEventListener("hashchange", handler);
      channel?.close();
      searchAbort.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(""), 8000);
      return () => clearTimeout(timer);
    }
  }, [message]);
  function navigate(next) {
    location.hash = next;
    setPage(next);
    setQuery("");
    window.scrollTo(0, 0);
  }
  async function commit(outings) {
    const next = await writeLibrary(outings, libraryRef.current.revision);
    setLibrary(next);
    libraryRef.current = next;
    return next;
  }
  async function saveOuting(outing, originalStamp, isNew) {
    const current = libraryRef.current.outings,
      existing = current.find((x) => x.id === outing.id);
    if (!isNew && (!existing || existing.updatedAt !== originalStamp))
      throw new Error(
        "This outing changed in another tab. Close this editor and open it again to see the latest version.",
      );
    if (
      isNew &&
      current.some(
        (x) => x.status === "planned" && x.place.id === outing.place.id,
      )
    )
      throw new Error(
        "This place is already in your plans. Open it from Do it.",
      );
    await commit(
      existing
        ? current.map((o) => (o.id === outing.id ? outing : o))
        : [outing, ...current],
    );
    setEditor(null);
    setMemoryDetail(null);
    setSelected(null);
    setMessage(
      outing.status === "visited"
        ? "Memory saved in this browser."
        : "Your plan is saved.",
    );
    navigate(outing.status === "visited" ? "memories" : "plans");
  }
  function addPlan(place) {
    const existing = library.outings.find(
      (x) => x.status === "planned" && x.place.id === place.id,
    );
    setSelected(null);
    setEditor({ outing: existing || makeOuting(place), isNew: !existing });
  }
  function manual(memory = false) {
    const stamp = new Date().toISOString();
    setEditor({
      isNew: true,
      outing: {
        id: crypto.randomUUID(),
        place: {
          id: "manual-" + crypto.randomUUID(),
          name: "",
          address: "",
          category: "",
          source: "You",
          sourceUrl: "",
          website: "",
          hours: "",
          fee: "",
          access: "",
        },
        status: memory ? "visited" : "planned",
        planDate: "",
        visitDate: memory ? localDate() : "",
        notes: "",
        with: "",
        rating: 0,
        photos: [],
        createdAt: stamp,
        updatedAt: stamp,
      },
    });
  }
  function visit(outing) {
    setMemoryDetail(null);
    setEditor({
      isNew: false,
      outing: { ...outing, status: "visited", visitDate: localDate() },
    });
  }
  async function remove(outing) {
    if (
      !window.confirm(
        `Delete “${outing.place.name}” and its saved photos from this browser? Export a backup first if you want to keep a copy.`,
      )
    )
      return;
    try {
      await commit(
        libraryRef.current.outings.filter((o) => o.id !== outing.id),
      );
      setMemoryDetail(null);
      setMessage("Outing removed.");
    } catch (e) {
      setStorageError(e.message);
    }
  }
  async function searchCities(e) {
    e.preventDefault();
    setCityBusy(true);
    setSearchError("");
    try {
      const matches = await findCities(cityText);
      setCityMatches(matches);
    } catch (e) {
      setSearchError(e.message);
    } finally {
      setCityBusy(false);
    }
  }
  async function searchPlaces(area = city) {
    const id = ++request.current;
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setSearchBusy(true);
    setSearchError("");
    setResult(null);
    try {
      const res = await fetch(
        `/api/discover?${new URLSearchParams({ lat: area.lat, lng: area.lng, radius, category })}`,
        { signal: controller.signal },
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          data.error || "Search is unavailable. Try again in a moment.",
        );
      if (id === request.current)
        setResult({ ...data, cityLabel: area.label, category });
    } catch (e) {
      if (e.name !== "AbortError" && id === request.current)
        setSearchError(e.message);
    } finally {
      if (id === request.current) setSearchBusy(false);
    }
  }
  function invalidateSearch() {
    request.current++;
    searchAbort.current?.abort();
    setSearchBusy(false);
    setResult(null);
    setSearchError("");
  }
  function chooseCity(area) {
    request.current++;
    searchAbort.current?.abort();
    setSearchBusy(false);
    setCity(area);
    setCityText(area.name);
    setCityMatches(null);
    setResult(null);
    setSearchError("");
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
  async function exportJournal() {
    try {
      download(backupPayload(library));
      setMessage(
        "Backup download started. Keep it somewhere private; it includes your photos and notes.",
      );
    } catch (e) {
      setStorageError(e.message);
    }
  }
  async function importFile(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_BYTES)
        throw new Error("Choose a backup smaller than 50 MB.");
      const incoming = validateBackup(JSON.parse(await file.text()));
      const preview = mergeOutings(libraryRef.current.outings, incoming);
      setImporting({
        incoming,
        added: preview.added,
        updated: preview.updated,
        count: incoming.length,
      });
    } catch (e) {
      setStorageError(
        e instanceof SyntaxError
          ? "This is not a readable JSON backup. Your journal has not changed."
          : e.message,
      );
    }
  }
  async function restore() {
    setImportBusy(true);
    try {
      const merged = mergeOutings(
        libraryRef.current.outings,
        importing.incoming,
      );
      await commit(merged.outings);
      setImporting(null);
      setStorageError("");
      setMessage(
        `Backup merged: ${merged.added} added, ${merged.updated} updated. Existing newer outings were kept.`,
      );
    } catch (e) {
      setStorageError(e.message);
    } finally {
      setImportBusy(false);
    }
  }
  const plans = library.outings
    .filter((o) => o.status === "planned")
    .sort(
      (a, b) =>
        (a.planDate || "9999").localeCompare(b.planDate || "9999") ||
        b.createdAt.localeCompare(a.createdAt),
    );
  const memories = library.outings
    .filter((o) => o.status === "visited")
    .sort(
      (a, b) =>
        b.visitDate.localeCompare(a.visitDate) ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
  const filtered = (page === "plans" ? plans : memories).filter((o) =>
    `${o.place.name} ${o.place.category} ${o.place.address} ${o.notes} ${o.with}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const visiblePlaces = result?.places || [];
  return (
    <>
      <header className="app-header">
        <a className="brand" href="#find" onClick={() => navigate("find")}>
          boredone<span>↗</span>
        </a>
        <nav aria-label="Main navigation">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              className="nav-button"
              aria-current={page === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              {label}
              {id === "plans" && plans.length > 0 && (
                <span>{plans.length}</span>
              )}
              {id === "memories" && memories.length > 0 && (
                <span>{memories.length}</span>
              )}
            </button>
          ))}
        </nav>
        <button
          className={`journal-button ${page === "settings" ? "active" : ""}`}
          onClick={() => navigate("settings")}
          aria-label="Journal settings and backup"
        >
          Your journal <span>↗</span>
        </button>
      </header>
      <main className="main-shell">
        {storageError && (
          <div className="notice error" role="alert">
            {storageError}
            <button
              className="text-button"
              onClick={() => {
                setStorageError("");
                load();
              }}
            >
              Reload journal
            </button>
          </div>
        )}
        {message && (
          <div className="notice success" role="status" ref={noticeRef}>
            {message}
          </div>
        )}
        {page === "find" && (
          <>
            <section className="page-intro">
              <div>
                <p className="eyebrow">Less scrolling. More living.</p>
                <h1>
                  Make a little
                  <br />
                  <span>room for fun.</span>
                </h1>
                <p>Find it. Do it. Remember.</p>
              </div>
              <div className="intro-note">
                <strong>What sounds good today?</strong>
                <p>
                  A new corner of your city. A place you keep meaning to try.
                  Something worth remembering.
                </p>
                <button
                  className="text-button"
                  onClick={() => manual()}
                  disabled={!ready}
                >
                  Already have an idea? Add it ↗
                </button>
              </div>
            </section>
            <section className="discovery-panel" aria-label="Discover places">
              <div className="search-toolbar">
                <form className="city-search" onSubmit={searchCities}>
                  <label htmlFor="city">City or town</label>
                  <div>
                    <input
                      id="city"
                      maxLength={120}
                      value={cityText}
                      onChange={(e) => setCityText(e.target.value)}
                      placeholder="Search a city"
                      required
                    />
                    <button
                      type="submit"
                      className="secondary"
                      disabled={cityBusy}
                    >
                      {cityBusy ? "Finding…" : "Find city"}
                    </button>
                  </div>
                </form>
                <label>
                  Within
                  <select
                    value={radius}
                    onChange={(e) => {
                      invalidateSearch();
                      setRadius(e.target.value);
                    }}
                  >
                    <option value="1500">1.5 km</option>
                    <option value="3000">3 km</option>
                    <option value="5000">5 km</option>
                  </select>
                </label>
                <button
                  className="secondary locate"
                  disabled={geoBusy}
                  onClick={geolocate}
                >
                  {geoBusy ? "Locating…" : "Use my area"}
                </button>
              </div>
              {cityMatches && (
                <div className="city-results">
                  <strong>
                    {cityMatches.length
                      ? "Choose your city"
                      : "No matching city found"}
                  </strong>
                  {cityMatches.map((match) => (
                    <button
                      className="city-result"
                      key={match.id}
                      onClick={() => chooseCity(match)}
                    >
                      {match.label}
                      <span>↗</span>
                    </button>
                  ))}
                  {!cityMatches.length && (
                    <p>
                      Try a larger nearby city, a country code, or your
                      approximate location. This directory covers towns with
                      about 15,000 residents or more.
                    </p>
                  )}
                </div>
              )}
              <div className="category-row" aria-label="Activity categories">
                {[
                  ["all", "A little of everything"],
                  ["outdoors", "Outside"],
                  ["culture", "Arts & culture"],
                  ["food", "Food & coffee"],
                  ["play", "Something playful"],
                ].map(([value, label]) => (
                  <button
                    className="chip"
                    aria-pressed={category === value}
                    key={value}
                    onClick={() => {
                      invalidateSearch();
                      setCategory(value);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="search-bottom">
                <p>
                  <strong>{city.label}</strong>
                  <span>
                    Real places from OpenStreetMap. Check hours and availability
                    before going.
                  </span>
                </p>
                <button onClick={() => searchPlaces()} disabled={searchBusy}>
                  {searchBusy ? "Finding places…" : "Explore this area ↗"}
                </button>
              </div>
            </section>
            {searchError && (
              <div role="alert" className="notice error">
                {searchError}
              </div>
            )}
            <section className="discovery-results" aria-busy={searchBusy}>
              <div className="section-header">
                <div>
                  <h2>
                    {searchBusy
                      ? "Looking around…"
                      : result
                        ? `${visiblePlaces.length} places to consider`
                        : "Your next good day starts somewhere."}
                  </h2>
                  <p>
                    {result
                      ? `${result.cityLabel} · ${result.radius / 1000} km · Retrieved ${new Date(result.fetchedAt).toLocaleString()}`
                      : "Choose your area, then explore parks, cafés, museums and more."}
                  </p>
                </div>
                <button
                  className="secondary"
                  onClick={() => setMapVisible((v) => !v)}
                >
                  {mapVisible ? "Hide map" : "Show map"}
                </button>
              </div>
              {mapVisible && (
                <Map
                  center={result?.center || city}
                  places={visiblePlaces}
                  selected={selected?.id}
                  onSelect={setSelected}
                />
              )}
              {result && visiblePlaces.length === 0 && (
                <div className="empty-state">
                  <h3>No matching places in this area.</h3>
                  <p>
                    Try a larger radius or another category. You can always add
                    a place you know.
                  </p>
                  <button
                    className="secondary"
                    onClick={() => manual()}
                    disabled={!ready}
                  >
                    Add your own idea
                  </button>
                </div>
              )}
              {visiblePlaces.length > 0 && (
                <div className="place-grid">
                  {visiblePlaces.map((place, i) => {
                    const planned = plans.some((x) => x.place.id === place.id);
                    return (
                      <article className="place-card" key={place.id}>
                        <div className="place-meta">
                          <span className="place-number">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span>{place.category}</span>
                          <span>{place.distanceKm} km</span>
                        </div>
                        <h3>
                          <button
                            className="title-button"
                            onClick={() => setSelected(place)}
                          >
                            {place.name}
                          </button>
                        </h3>
                        <p>
                          {place.address || "Explore the map for this location"}
                        </p>
                        <div className="card-actions">
                          <button
                            className="secondary"
                            disabled={!ready}
                            onClick={() => addPlan(place)}
                          >
                            {planned ? "View your plan" : "Make a plan"}
                          </button>
                          <button
                            className="text-button"
                            onClick={() => setSelected(place)}
                          >
                            Details ↗
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              {result && (
                <p className="source-note">
                  ©{" "}
                  <a
                    href="https://www.openstreetmap.org/copyright"
                    target="_blank"
                    rel="noreferrer"
                  >
                    OpenStreetMap contributors
                  </a>{" "}
                  · Discovery via{" "}
                  <a href={result.providerUrl} target="_blank" rel="noreferrer">
                    {result.providerName}
                  </a>
                  .{" "}
                  {result.sourceUpdatedAt &&
                    `Source snapshot: ${new Date(result.sourceUpdatedAt).toLocaleDateString()}. `}
                  Community listings can be incomplete. These are venues, not
                  live events or available tickets.
                </p>
              )}
            </section>
          </>
        )}
        {(page === "plans" || page === "memories") && (
          <>
            <section className="collection-intro">
              <p className="eyebrow">
                {page === "plans" ? "Good things ahead" : "The days you kept"}
              </p>
              <h1>
                {page === "plans" ? "A reason to get out." : "You were here."}
              </h1>
              <p>
                {page === "plans"
                  ? "Little plans, big possibilities. Pick one and make a day of it."
                  : "Your own collection of places, people and moments."}
              </p>
              <button
                onClick={() => manual(page === "memories")}
                disabled={!ready}
              >
                {page === "plans" ? "+ Add a plan" : "+ Add a memory"}
              </button>
            </section>
            <div className="section-header">
              <h2>
                {page === "plans"
                  ? `${plans.length} saved ${plans.length === 1 ? "plan" : "plans"}`
                  : `${memories.length} ${memories.length === 1 ? "memory" : "memories"}`}
              </h2>
              <label className="collection-search">
                <span className="sr-only">Search your {page}</span>
                <input
                  placeholder={`Search your ${page}…`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            </div>
            {!filtered.length ? (
              <div className="empty-state">
                <span className="empty-number">
                  {query ? "?" : page === "plans" ? "01" : "03"}
                </span>
                <h3>
                  {query
                    ? "Nothing matches that search."
                    : page === "plans"
                      ? "Your next plan belongs here."
                      : "The best part comes after."}
                </h3>
                <p>
                  {query
                    ? "Try a place, person or word from your notes."
                    : page === "plans"
                      ? "Save a place from Find it, or add something you already have in mind."
                      : "Visit a saved plan or add a past outing. Give it a few words and a photo worth keeping."}
                </p>
                {!query && (
                  <button
                    className="secondary"
                    onClick={() =>
                      page === "plans" ? navigate("find") : manual(true)
                    }
                    disabled={!ready}
                  >
                    {page === "plans"
                      ? "Find something to do"
                      : "Add your first memory"}
                  </button>
                )}
              </div>
            ) : (
              <div
                className={page === "plans" ? "plans-list" : "memories-grid"}
              >
                {filtered.map((outing) =>
                  page === "plans" ? (
                    <article className="plan-card" key={outing.id}>
                      <div className="plan-date">
                        <strong>
                          {outing.planDate
                            ? new Date(
                                outing.planDate + "T12:00:00",
                              ).toLocaleDateString(undefined, {
                                day: "2-digit",
                              })
                            : "Soon"}
                        </strong>
                        <span>
                          {outing.planDate
                            ? new Date(
                                outing.planDate + "T12:00:00",
                              ).toLocaleDateString(undefined, {
                                month: "short",
                                year: "numeric",
                              })
                            : "No rush"}
                        </span>
                      </div>
                      <div className="plan-info">
                        <span className="kicker">
                          {outing.place.category || "Your idea"}
                        </span>
                        <h3>{outing.place.name}</h3>
                        {outing.with && <p>With {outing.with}</p>}
                        {outing.notes && (
                          <p className="preserve-lines">{outing.notes}</p>
                        )}
                        <div className="plan-links">
                          <a
                            href={directions(outing.place)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open map ↗
                          </a>
                          {outing.place.website && (
                            <a
                              href={outing.place.website}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Venue website ↗
                            </a>
                          )}
                          {outing.place.sourceUrl && (
                            <a
                              href={outing.place.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Source listing ↗
                            </a>
                          )}
                          <button
                            className="text-button"
                            onClick={() => setEditor({ outing, isNew: false })}
                          >
                            Edit plan
                          </button>
                          <button
                            className="text-button quiet"
                            onClick={() => remove(outing)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      <button onClick={() => visit(outing)}>I went ↗</button>
                    </article>
                  ) : (
                    <article className="memory-card" key={outing.id}>
                      <button
                        className="memory-open"
                        onClick={() => setMemoryDetail(outing)}
                      >
                        {outing.photos[0] ? (
                          <img
                            src={outing.photos[0]}
                            alt={`Memory of ${outing.place.name}`}
                          />
                        ) : (
                          <div className="memory-no-photo">
                            <span>
                              {new Date(
                                outing.visitDate + "T12:00:00",
                              ).toLocaleDateString(undefined, {
                                month: "short",
                              })}
                            </span>
                            <strong>
                              {new Date(
                                outing.visitDate + "T12:00:00",
                              ).getDate()}
                            </strong>
                            <span>
                              {outing.place.category || "A day to remember"}
                            </span>
                          </div>
                        )}
                        <div className="memory-body">
                          <p className="kicker">
                            {displayDate(outing.visitDate)}
                            {outing.rating > 0 && ` · ${outing.rating}/5`}
                          </p>
                          <h3>{outing.place.name}</h3>
                          {outing.with && <p>With {outing.with}</p>}
                          {outing.notes && (
                            <p className="memory-excerpt">{outing.notes}</p>
                          )}
                          <span className="memory-link">Open memory ↗</span>
                        </div>
                      </button>
                    </article>
                  ),
                )}
              </div>
            )}
          </>
        )}
        {page === "settings" && (
          <>
            <section className="collection-intro">
              <p className="eyebrow">Your plans. Your memories.</p>
              <h1>A journal that’s yours.</h1>
              <p>Everything you save stays in this browser on this device.</p>
            </section>
            <div className="settings-grid">
              <section className="settings-card">
                <h2>Keep a copy.</h2>
                <p>
                  {plans.length} plans · {memories.length} memories ·{" "}
                  {library.outings.reduce((n, o) => n + o.photos.length, 0)}{" "}
                  photos
                </p>
                <p>
                  There is no account or automatic cloud sync. Clearing browser
                  data, changing browsers or losing this device can remove your
                  journal. Export regularly, and import your backup on another
                  device.
                </p>
                <div className="button-row">
                  <button disabled={!ready} onClick={exportJournal}>
                    Export your journal
                  </button>
                  <label
                    className={`button secondary file-button ${!ready ? "disabled" : ""}`}
                  >
                    Import a backup
                    <input
                      type="file"
                      accept="application/json,.json"
                      aria-label="Import a backup"
                      onChange={importFile}
                      disabled={!ready}
                    />
                  </label>
                </div>
                <p className="hint">
                  The JSON backup includes all photos and notes. Keep it
                  private. Imports merge by outing ID, keeping the more recently
                  edited version. Up to 500 outings and 50 MB per backup.
                </p>
                <button
                  className="text-button"
                  onClick={async () => {
                    try {
                      const granted = await navigator.storage?.persist?.();
                      setMessage(
                        granted
                          ? "Persistent storage is enabled. Keep making backups too."
                          : "This browser did not grant persistent storage. Your journal still saves locally; regular backups are the best protection.",
                      );
                    } catch {
                      setMessage(
                        "Persistent storage is unavailable. Keep regular backups.",
                      );
                    }
                  }}
                >
                  Ask browser to keep this journal ↗
                </button>
              </section>
              <section className="settings-card">
                <h2>What leaves your device?</h2>
                <p>
                  Your notes, companions and photos are never uploaded by
                  Boredone. Photos are resized locally and embedded metadata is
                  removed before saving. Anyone with access to this browser
                  profile can read the journal.
                </p>
                <p>
                  Searching places sends only an approximate search center,
                  radius and category to our server, then to{" "}
                  <a
                    href="https://overpass.private.coffee/#privacy-policy"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Private.coffee
                  </a>{" "}
                  or its fallback,{" "}
                  <a
                    href="https://maps.mail.ru/osm/tools/overpass/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    VK Maps
                  </a>
                  . The results name the provider used. No journal content is
                  sent to either service. The map loads tiles from{" "}
                  <a
                    href="https://osmfoundation.org/wiki/Privacy_Policy"
                    target="_blank"
                    rel="noreferrer"
                  >
                    OpenStreetMap
                  </a>
                  ; tile requests reveal the viewed area and your IP address.
                  Use “Hide map” to stop loading tiles.
                </p>
                <p>
                  City lookup uses a bundled{" "}
                  <a
                    href="https://www.geonames.org/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    GeoNames
                  </a>{" "}
                  directory under{" "}
                  <a
                    href="https://creativecommons.org/licenses/by/4.0/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    CC BY 4.0
                  </a>
                  . No external city-search API is called.
                </p>
                <p className="hint">
                  Local journal storage is not encrypted. Boredone has no
                  analytics or advertising trackers.
                </p>
              </section>
            </div>
          </>
        )}
        <footer className="app-footer">
          <span>boredone · Find it. Do it. Remember.</span>
          <button className="text-button" onClick={() => navigate("settings")}>
            Saved on this device · Backup & privacy ↗
          </button>
        </footer>
      </main>
      <nav className="mobile-tabs" aria-label="Mobile navigation">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            aria-current={page === id ? "page" : undefined}
            onClick={() => navigate(id)}
          >
            {label}
          </button>
        ))}
        <button
          aria-current={page === "settings" ? "page" : undefined}
          onClick={() => navigate("settings")}
        >
          Journal
        </button>
      </nav>
      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)}>
          <p className="kicker">
            {selected.category} · {selected.distanceKm} km from your search
            center
          </p>
          <p>{selected.address || "See the map for its location."}</p>
          <dl className="place-facts">
            <dt>Opening hours</dt>
            <dd>{selected.hours || "Not listed. Check with the venue."}</dd>
            <dt>Entry / price</dt>
            <dd>{selected.fee}</dd>
            <dt>Wheelchair access</dt>
            <dd>{selected.access || "Not listed. Check with the venue."}</dd>
          </dl>
          <p className="hint">
            Community information can be incomplete or out of date. Confirm
            hours, access and bookings with the venue.
          </p>
          <div className="button-row">
            <a
              className="button secondary"
              href={directions(selected)}
              target="_blank"
              rel="noreferrer"
            >
              Open map ↗
            </a>
            {selected.website && (
              <a
                className="button secondary"
                href={selected.website}
                target="_blank"
                rel="noreferrer"
              >
                Venue website ↗
              </a>
            )}
            <a
              className="text-button"
              href={selected.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Source listing ↗
            </a>
          </div>
          <div className="dialog-actions">
            <button disabled={!ready} onClick={() => addPlan(selected)}>
              Make a plan
            </button>
          </div>
        </Modal>
      )}
      {editor && (
        <Editor
          key={editor.outing.id}
          {...editor}
          onClose={() => setEditor(null)}
          onSave={saveOuting}
        />
      )}
      {memoryDetail && (
        <Modal
          title={memoryDetail.place.name}
          wide
          onClose={() => setMemoryDetail(null)}
        >
          <p className="kicker">
            {displayDate(memoryDetail.visitDate)}
            {memoryDetail.rating > 0 && ` · ${memoryDetail.rating}/5`}
          </p>
          {memoryDetail.with && <p>With {memoryDetail.with}</p>}
          <p className="memory-notes">
            {memoryDetail.notes || "A day worth keeping."}
          </p>
          <div className="memory-photos">
            {memoryDetail.photos.map((photo, i) => (
              <img
                key={i}
                src={photo}
                alt={`Memory photo ${i + 1} from ${memoryDetail.place.name}`}
              />
            ))}
          </div>
          <div className="button-row">
            <a
              className="button secondary"
              href={directions(memoryDetail.place)}
              target="_blank"
              rel="noreferrer"
            >
              Open map ↗
            </a>
            <button
              className="secondary"
              onClick={() => {
                setEditor({ outing: memoryDetail, isNew: false });
                setMemoryDetail(null);
              }}
            >
              Edit memory
            </button>
            <button
              onClick={() => {
                const place = memoryDetail.place;
                setMemoryDetail(null);
                addPlan(place);
              }}
            >
              Go again
            </button>
            <button
              className="text-button quiet"
              onClick={() => remove(memoryDetail)}
            >
              Delete memory
            </button>
          </div>
        </Modal>
      )}
      {importing && (
        <Modal
          title="Bring your journal back"
          onClose={() => !importBusy && setImporting(null)}
        >
          <p>
            This backup contains {importing.count} outings. It will add{" "}
            {importing.added} and update {importing.updated} older versions.
            Your other outings and newer edits will stay.
          </p>
          <p>
            Back up your current journal first if you want to preserve both
            versions of an edited outing.
          </p>
          {storageError && (
            <p className="notice error" role="alert">
              {storageError}
            </p>
          )}
          <div className="dialog-actions">
            <button className="secondary" onClick={exportJournal}>
              Export current journal
            </button>
            <button disabled={importBusy} onClick={restore}>
              {importBusy ? "Merging…" : "Merge backup"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
