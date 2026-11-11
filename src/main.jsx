import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Album from "./Album";
import MemoryTimeline from "./MemoryTimeline";
import {memoryOptions} from "./memoryFilters";
import Editor, { Modal } from "./Editor";
import ExploreWorld from "./ExploreWorld";
import { journalPlaces, placeIcon } from "./exploration";
import { discoveryKey, readDiscovery, saveDiscovery, clearDiscoveryCache } from "./discoveryCache";
import { preloadedDiscovery, bundledArea, enrichBundledArea, CORRIDOR_AREA } from "./preloaded";
import {mergeEditorial} from "./recommendations";
import { findPlaces, findEditorial } from "./findPlaces";
import { sampleResult } from "./sample";
import { findCities } from "./cities";
import { readLibrary, writeLibrary, readDrafts, writeDraft, deleteDraft } from "./storage";
import JournalRoot from "./JournalRoot";
import AccountPanel,{syncLabel} from "./AccountPanel";
import {
  backupPayload,
  blankLibrary,
  displayDate,
  localDate,
  makeOuting,
  MAX_BACKUP_BYTES,
  mergeOutings,
  validateBackup,
  validateOuting,
} from "./model";
import "./styles.css";
import "./world.css";
import "./theme.css";
import useTheme from "./useTheme";

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready)
    .then(registration => registration.active?.postMessage("warm-guide-photos")).catch(() => {});
}

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
function download(data,limit=MAX_BACKUP_BYTES) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  if (blob.size > limit)
    throw new Error(
      `This backup exceeds ${limit/1024/1024} MB. Your journal has not changed.`,
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
const guestStore={read:readLibrary,save:(outings,revision,{draftId,draftStamp}={})=>writeLibrary(outings,revision,draftId,draftStamp),readDrafts,writeDraft,deleteDraft,channelName:"boredone-journal",backup:backupPayload,validateBackup,backupLimit:MAX_BACKUP_BYTES,validateOuting:value=>validateOuting(value)};
function App({store=guestStore,account=null,accountError=""}) {
  const [theme,toggleTheme]=useTheme();
  const [drafts,setDrafts]=useState([]),[draftError,setDraftError]=useState('');
  async function refreshDrafts(){try{setDrafts(await store.readDrafts());setDraftError('');}catch(e){setDraftError(e.message);}}

  const [iconStyle, setIconStyle] = useState(() => {
    try { return localStorage.getItem("boredone-icon-style") === "solid" ? "solid" : "line"; } catch { return "line"; }
  });
  useEffect(() => {
    document.documentElement.dataset.iconStyle = iconStyle;
    try { localStorage.setItem("boredone-icon-style", iconStyle); } catch { /* Optional appearance preference. */ }
  }, [iconStyle]);
  const [restoredDiscovery] = useState(() => preloadedDiscovery(readDiscovery()));
  const [page, setPage] = useState(pageFromHash),
    [savedLibrary, setSavedLibrary] = useState(blankLibrary),
    [demoLibrary, setDemoLibrary] = useState(blankLibrary),
    [demoMode, setDemoMode] = useState(false),
    [ready, setReady] = useState(false),
    [storageError, setStorageError] = useState(""),
    [message, setMessage] = useState("");
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
    [editor, setEditor] = useState(null),
    [importing, setImporting] = useState(null),
    [importBusy, setImportBusy] = useState(false),
    [query, setQuery] = useState(""),
    [geoBusy, setGeoBusy] = useState(false),
    [memoryDetail, setMemoryDetail] = useState(null),
    [mapVisible, setMapVisible] = useState(true),
    [mapLayer, setMapLayer] = useState("discover");
  useEffect(() => { if (memoryDetail) document.getElementById("memory-heading")?.focus(); }, [memoryDetail]);
  const library = demoMode ? demoLibrary : savedLibrary;
  const canEdit = (ready || demoMode) && !account?.removal;
  const setLibrary = demoMode ? setDemoLibrary : setSavedLibrary;
  const memoryScroll = useRef(0);
  function openMemory(outing) { memoryScroll.current = window.scrollY; setMemoryDetail(outing); window.scrollTo(0,0); }
  function closeMemory() { setMemoryDetail(null); requestAnimationFrame(() => window.scrollTo(0,memoryScroll.current)); }
  const libraryRef = useRef(library),
    request = useRef(0),
    searchAbort = useRef(null),
    noticeRef = useRef(null);
  libraryRef.current = library;
  async function load() {
    try {
      const data = await store.read();
      setSavedLibrary(previous=>data.revision>=previous.revision?data:previous);
      setReady(true);
      setStorageError("");
    } catch (e) {
      setStorageError(e.message);
    }
  }
  useEffect(() => {
    load();refreshDrafts();
    const handler = () => {const next=pageFromHash();setPage(next);if(next!=="memories")setMemoryDetail(null);setSelected(null);setQuery("");};
    window.addEventListener("hashchange", handler);
    let channel;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel(store.channelName);
        channel.onmessage = () => {load();refreshDrafts();};
      }
    } catch { /* Storage still works when cross-tab messaging is restricted. */ }
    const refresh = () => { if (document.visibilityState === "visible") {load();refreshDrafts();} };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("hashchange", handler);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      try { channel?.close(); } catch {}
      searchAbort.current?.abort();
    };
  }, []);
  useEffect(()=>{if(account?.refresh){load();refreshDrafts();}},[account?.refresh]);
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);
  function navigate(next) {
    location.hash = next;
    setPage(next);
    setQuery("");
    setSelected(null);
    setMemoryDetail(null);
    window.scrollTo(0, 0);
  }
  async function commit(outings, draftId, draftStamp) {
    const next = demoMode
      ? { ...libraryRef.current, outings, revision: libraryRef.current.revision + 1 }
      : await store.save(outings, libraryRef.current.revision, {draftId,draftStamp});
    setLibrary(next);
    libraryRef.current = next;
    return next;
  }
  async function saveOuting(outing, originalStamp, isNew, draftId, draftStamp) {
    const current = libraryRef.current.outings,
      existing = current.find((x) => x.id === outing.id);
    if (isNew && existing) throw new Error("This outing was already saved in another tab. Your draft is still here; reopen the saved memory before making further changes.");
    if (!isNew && (!existing || existing.updatedAt !== originalStamp))
      throw new Error(
        "This outing changed in another tab. Close this editor and open it again to see the latest version.",
      );
    if (
      isNew && outing.status === "planned" &&
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
        : [outing, ...current], draftId, draftStamp,
    );
    setEditor(null);
    setMemoryDetail(null);
    setSelected(null);
    setMessage(
      outing.status === "visited"
        ? (demoMode ? "Sample memory saved for this demo." : (account?.owner ? "Memory saved. Sync will continue when connected." : "Memory saved in this browser."))
        : "Your plan is saved.",
    );
    // Planning from the map should leave the explorer at their chosen view.
    // Journal-page edits continue to return to the corresponding collection.
    if (outing.status === "visited") { navigate("memories"); setMemoryDetail(outing); }
    else if (page !== "find") navigate(outing.status === "visited" ? "memories" : "plans");
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
  function saveVisit(place) {
    const outing = makeOuting(place);
    setSelected(null);
    setEditor({isNew:true,outing:{...outing,status:'visited',visitDate:localDate()}});
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
        `Delete “${outing.place.name}” and its saved photos ${account?.owner?'from your account and synced devices':'from this browser'}? Export a backup first if you want to keep a copy.`,
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
  function enterDemo() {
    invalidateSearch();
    setDemoLibrary(blankLibrary());
    setDemoMode(true);
    setCategory("all");
    setMapLayer("discover");
    setResult(sampleResult());
    setMessage("");
    navigate("find");
  }
  function leaveDemo() {
    setDemoMode(false);
    setDemoLibrary(blankLibrary());
    invalidateSearch();
    setMapLayer("discover");
    setCategory("all");
    const saved = preloadedDiscovery(readDiscovery());
    if (saved) { setResult(saved.result); setCity(saved.area); setCityText(saved.area.name); setCategory(saved.result.category); setRadius(String(saved.result.radius)); }
    setMessage("");
    navigate("find");
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
  async function exportJournal() {
    if (demoMode) { setMessage("Leave the demo to export your real journal."); return; }
    try {
      download(store.backup(library),store.backupLimit);
      setMessage(
        "Backup download started. Keep it somewhere private; it includes your photos and notes.",
      );
    } catch (e) {
      setStorageError(e.message);
    }
  }
  async function importFile(event) {
    if (demoMode) { event.target.value = ""; setMessage("Leave the demo to import into your real journal."); return; }
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > store.backupLimit)
        throw new Error(`Choose a backup smaller than ${store.backupLimit/1024/1024} MB.`);
      const incoming = store.validateBackup(JSON.parse(await file.text()));
      if(account?.owner){setImporting({incoming,count:incoming.length});return;}
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
      if(account?.owner){
        const result=await store.importLegacy(importing.incoming,libraryRef.current.revision);
        await load();setImporting(null);setStorageError('');setMessage(`Imported ${result.imported.added} outings. Different versions were kept as copies.`);return;
      }
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
    `${o.place.name} ${o.place.category} ${o.place.address} ${o.notes} ${o.with} ${o.visitDate} ${displayDate(o.visitDate)}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const visiblePlaces = useMemo(() => mapLayer === "discover"
    ? (result?.places || [])
    : journalPlaces(library.outings, mapLayer), [mapLayer, result, library.outings]);
  return (
    <>
      <header className={`app-header ${page==="find"?"explore-header":""}`}>
        <a className="brand" href="#find" onClick={() => navigate("find")}>
          boredone
        </a>
        <nav aria-label="Main navigation" hidden={page==="find"}>
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
        <div className="header-actions">
        <button className="theme-toggle" onClick={toggleTheme} aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'} title={theme==='dark'?'Light mode':'Dark mode'}><img src={`/world/icons/${theme==='dark'?'sun':'moon'}.svg`} alt=""/></button>
        <button
          className={`journal-button ${page === "settings" ? "active" : ""}`}
          onClick={() => navigate(page==="find"?"plans":"settings")}
          aria-label={page==="find"?"Saved outings":"Journal settings and backup"}
        >
          {page==="find"?<><img src="/world/icons/bookmark-simple.svg" alt=""/> {drafts.length?`Saved · ${drafts.length}`:"Saved"}</>:<>Your journal <span>↗</span></>}
        </button>
        </div>
      </header>
      <main className={`main-shell ${page === "find" ? "world-main" : ""}`}>
        {demoMode && page !== "find" && <div className="demo-banner" role="status"><div><strong>You’re exploring a sample day.</strong><span>Fictional places. Plans and memories stay in this demo only and disappear when you leave or reload.</span></div><button className="secondary" onClick={leaveDemo}>Leave demo</button></div>}
        {accountError&&<p className="notice error" role="alert">{accountError}</p>}
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
        {page !== 'find' && !demoMode && !memoryDetail && <>
          {draftError && <p className="notice error" role="alert">{draftError}</p>}
          {drafts.length>0 && <section className="draft-recovery" aria-label="Unfinished outings"><h2>Pick up where you left off</h2>{drafts.map(d=><div className="draft-row" key={d.id}><div><strong>{d.outing.place.name || 'Unfinished outing'}</strong><p>{d.outing.photos.length} {d.outing.photos.length===1?"photo":"photos"} · Saved on this device</p></div><button className="secondary" disabled={!canEdit} onClick={()=>setEditor({outing:d.outing,isNew:d.isNew,recovery:d})}>Resume</button><button className="text-button" disabled={!canEdit} onClick={async()=>{if(!confirm('Discard this unfinished outing and its draft photos? Saved memories stay unchanged.'))return;try{await store.deleteDraft(d.id,d.savedAt);refreshDrafts();}catch(e){setDraftError(e.message);}}}>Discard</button></div>)}</section>}
        </>}
        {page === "find" && <ExploreWorld theme={theme}
          city={city} cityText={cityText} cityMatches={cityMatches} cityBusy={cityBusy} cityError={cityError} geoBusy={geoBusy}
          category={category} radius={radius} result={result} searchBusy={searchBusy} searchPhase={searchPhase} searchError={searchError}
          selected={selected} mapVisible={mapVisible} mapLayer={mapLayer} canEdit={canEdit}
          plans={plans} memories={memories} outings={library.outings} places={visiblePlaces} demoMode={demoMode}
          onCorridor={chooseCorridor} onCityText={setCityText} onSearchCities={searchCities} onChooseCity={chooseCity} onGeolocate={geolocate}
          onCategory={setCategory} onRadius={(value) => { setRadius(value); searchPlaces(city, false, false, value); }}
          onSearch={(force = false) => searchPlaces(city, force)} onDownloadArea={() => searchPlaces(city, true, true)} onDismissError={() => setSearchError("")} onSelect={setSelected} onLayer={(value) => { setMapLayer(value); setSelected(null); }}
          onMapVisible={setMapVisible} onSaveVisit={saveVisit} onPlan={addPlan} onVisit={visit} onMemory={(memory) => { navigate("memories"); setMemoryDetail(memory); }}
          onManual={() => manual()} onDemo={enterDemo} onLeaveDemo={leaveDemo} onNavigate={navigate} directions={directions}
        />}
        {page === "memories" && <div hidden={Boolean(memoryDetail)}><MemoryTimeline memories={memories} canEdit={canEdit} onAdd={()=>manual(true)} onOpen={openMemory}/></div>}
        {page === "plans" && !memoryDetail && (
          <>
            <section className="collection-intro">
              <div><h1>{page === "plans" ? "Your plans" : "Your memories"}</h1><p>{page === "plans" ? "Next up, whenever you’re ready." : "Places, people, good days."}</p></div>
              <button onClick={() => manual(page === "memories")} disabled={!canEdit}>{page === "plans" ? "+ Add a plan" : "+ Add a memory"}</button>
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
                      : "Add photos from a visit, or save an outing without photos."}
                </p>
                {!query && (
                  <button
                    className="secondary"
                    onClick={() =>
                      page === "plans" ? navigate("find") : manual(true)
                    }
                    disabled={!canEdit}
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
                        <details className="plan-options"><summary>Details & edit</summary><div className="plan-links">
                          {outing.place.source !== "Sample" && <a
                            href={directions(outing.place)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open map ↗
                          </a>}
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
                            disabled={!canEdit}
                            onClick={() => setEditor({ outing, isNew: false })}
                          >
                            Edit plan
                          </button>
                          <button
                            className="text-button quiet"
                            disabled={!canEdit}
                            onClick={() => remove(outing)}
                          >
                            Remove
                          </button>
                        </div>
                      </details></div>
                      <button disabled={!canEdit} onClick={() => visit(outing)}>I went ↗</button>
                    </article>
                  ) : null,
                )}
              </div>
            )}
          </>
        )}
        {page === "settings" && <>
          <section className="collection-intro"><div><h1>Your journal</h1><p>{syncLabel(account,library.sync)}.</p></div><button onClick={() => manual(true)} disabled={!canEdit}>+ Add a memory</button></section>
          <div className="journal-counts"><button onClick={() => navigate("plans")}><strong>{plans.length}</strong><span>Plans ↗</span></button><button onClick={() => navigate("memories")}><strong>{memories.length}</strong><span>Memories ↗</span></button><div><strong>{new Set(memories.map(outing => outing.place.id)).size}</strong><span>Places visited</span></div></div>
          <div className="journal-layout"><section className="journal-recent"><h2>Recently remembered</h2>
            {memories.length ? memories.slice(0, 4).map(outing => <button className="journal-entry" key={outing.id} onClick={() => {navigate("memories");setMemoryDetail(outing);}}>{outing.photos[0] ? <img src={outing.photos[0]} alt=""/> : <span className={`landmark-sprite landmark-${placeIcon(outing.place.category)}`} aria-hidden="true"/>}<span><strong>{outing.place.name}</strong><small>{displayDate(outing.visitDate)}</small>{outing.notes && <span className="journal-excerpt">{outing.notes}</span>}</span><span aria-hidden="true">↗</span></button>) : <div className="journal-empty"><p>Your memories will collect here.</p><button className="secondary" onClick={() => navigate("find")}>Find an outing</button></div>}
          </section><aside className="journal-tools">{account&&<AccountPanel account={account} library={library} onChanged={load} onExport={exportJournal}/>}<section className="settings-card"><h2>Keep a copy</h2><p>{account?.owner?"Export a private copy of the visits and photos on this device.":"No cloud sync. Export a backup to keep your photos and notes safe."}</p><div className="button-row"><button disabled={!ready&&!demoMode} onClick={exportJournal}>Export your journal</button><label className={`button secondary file-button ${!canEdit ? "disabled" : ""}`}>Import a backup<input type="file" accept="application/json,.json" aria-label="Import a backup" onChange={importFile} disabled={!canEdit}/></label></div><details className="quiet-details"><summary>Backup help</summary><p>Clearing browser data or losing this device can remove your journal. {account?.owner?"Imports keep different versions as separate copies.":"Imports merge by outing ID, keeping the newer edit."} The JSON includes photos and notes; keep it private. Up to 500 outings{account?.owner?"; 50 MB of unique photos, 80 MB per backup":" and 50 MB"}. Finish unfinished outings before exporting; drafts stay on this device.</p><button className="text-button" onClick={async () => {try {const granted = await navigator.storage?.persist?.();setMessage(granted ? "Persistent storage enabled." : "Keep regular backups; persistent storage was not granted.");} catch {setMessage("Persistent storage unavailable. Keep regular backups.");}}}>Ask browser to keep this journal</button></details></section>
          <section className="settings-card"><h2>Map icons</h2><div className="icon-choices" aria-label="Map icon style">{[["line","Line"],["solid","Solid"]].map(([value,label]) => <button key={value} aria-pressed={iconStyle === value} onClick={() => setIconStyle(value)}><span className={`icon-preview icon-preview-${value}`} aria-hidden="true">{["garden","cafe","gallery","play"].map(kind => <span key={kind} className={`landmark-sprite landmark-${kind}`}/>)}</span>{label}</button>)}</div></section>
          </aside></div>
              <details className="quiet-details privacy-details">
                <summary>Privacy, offline storage & data sources</summary>
                <p>
                  {account?.owner?"Visits, companions and photos saved in your account are uploaded privately to Supabase for syncing. Your Google account is used only for sign-in. Device saves are uploaded only when you choose to copy them.":"Your notes, companions and photos in this device journal are never uploaded by Boredone."} Photos are resized locally and embedded metadata is
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
                  sent to either service. The illustrated map loads vector tiles from{" "}
                  <a
                    href="https://openfreemap.org/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    OpenFreeMap
                  </a>
                  ; tile requests reveal the viewed area and your IP address.
                  Use “Hide map” to stop loading tiles.
                </p>
                <p>Editorial descriptions come from Wikivoyage contributors (CC BY-SA 4.0). Licensed Commons photos include author credits and work offline. Venue website previews load directly from the linked website or its image host, which receives your IP address; Boredone sends no referrer. These online images are not bundled for offline use or treated as openly licensed photos. Venue services never receive your saved notes or personal photos.</p>
                <p>Up to 12 recent place searches are kept in this browser with their original retrieval dates: live searches for 24 hours, explicitly saved map areas for 30 days. This public directory cache is separate from your journal and lets you keep exploring during an outage. After a successful online visit in a supported browser, the production app also caches its public files so you can reopen offline. Map tiles and live searches still require internet; browser storage may be evicted.</p>
                <button className="secondary" onClick={() => { clearDiscoveryCache(); setResult(bundledArea(city, radius)); setMessage("Saved place searches cleared. Your journal is unchanged."); }}>Clear saved place searches</button>
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
              </details>
        </>}
      {memoryDetail && (
        <article className="memory-page">
          <button className="text-button" onClick={closeMemory}>← All memories</button>
          <h1 id="memory-heading" tabIndex={-1}>{memoryDetail.place.name}</h1>
          <p className="kicker">
            {displayDate(memoryDetail.visitDate)}
            {memoryDetail.rating > 0 && ` · ${memoryDetail.rating}/5`}
          </p>
          {memoryDetail.with && <p>With {memoryDetail.with}</p>}
          <p className="memory-notes">
            {memoryDetail.notes}
          </p>
          <Album photos={memoryDetail.photos} name={memoryDetail.place.name}/>
          <button className="text-button" disabled={!canEdit} onClick={()=>saveVisit(memoryDetail.place)}>Save another visit here</button>
          <div className="button-row">
            {memoryDetail.place.source !== "Sample" && <a
              className="button secondary"
              href={directions(memoryDetail.place)}
              target="_blank"
              rel="noreferrer"
            >
              Open map ↗
            </a>}
            <button
              className="secondary"
              disabled={!canEdit}
              onClick={() => {
                setEditor({ outing: memoryDetail, isNew: false });
                setMemoryDetail(null);
              }}
            >
              Edit memory
            </button>
            <button
              disabled={!canEdit}
              onClick={() => {
                const place = memoryDetail.place;
                setMemoryDetail(null);
                addPlan(place);
              }}
            >
              Plan another visit
            </button>
            <button
              className="text-button quiet"
              disabled={!canEdit}
              onClick={() => remove(memoryDetail)}
            >
              Delete memory
            </button>
          </div>
        </article>
      )}
        <footer className="app-footer">
          <span>boredone</span>
          <button className="text-button" onClick={() => navigate("settings")}>
            Backup & privacy
          </button>
        </footer>
      </main>

      {editor && (
        <Editor
          key={editor.outing.id}
          draftStore={store}
          validate={store.validateOuting}
          preserveDate={!!account?.owner}
          syncEnabled={!!account?.owner}
          {...editor}
          onClose={() => setEditor(null)}
          onSave={saveOuting}
          draftsEnabled={!demoMode}
          onDraftsChanged={refreshDrafts}
          people={memoryOptions(library.outings).people}
        />
      )}
      {importing && (
        <Modal
          title="Bring your journal back"
          onClose={() => !importBusy && setImporting(null)}
        >
          {account?.owner?<p>This backup contains {importing.count} outings. Matching saves are skipped. Different versions are kept as separate copies; existing memories stay intact.</p>:<p>
            This backup contains {importing.count} outings. It will add{" "}
            {importing.added} and update {importing.updated} older versions.
            Your other outings and newer edits will stay.
          </p>}
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
createRoot(document.getElementById("root")).render(<JournalRoot App={App} guestStore={guestStore}/>);
