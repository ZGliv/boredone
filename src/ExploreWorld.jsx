import useTonight from './useTonight';
import {venuePhoto,useOnline} from './venuePhoto';
import {isSuppressedVenue} from './venueCorrections';
import React, { useEffect, useMemo, useState, useRef, useLayoutEffect } from "react";
import Map from "./Map";
import PlaceDock from "./PlaceDock";
import PlaceInspector from "./PlaceInspector";
import { VENUE_MOODS, matchesVenueMood } from "./venues";
import PlaceCard from "./PlaceCard";
import {rankRecommendations} from "./recommendations";
import { rankPlaces, DISTANCE_CHOICES } from "./shortlist";

export default function ExploreWorld({ theme, city, cityText, cityMatches, cityBusy, cityError, geoBusy, category, radius, result, searchBusy, searchPhase, searchError, selected, mapVisible, mapLayer, canEdit, plans, memories, outings, places, demoMode, onCorridor, onCityText, onSearchCities, onChooseCity, onGeolocate, onCategory, onRadius, onSearch, onDownloadArea, onDismissError, onSelect, onLayer, onMapVisible, onSaveVisit, onPlan, onVisit, onMemory, onManual, onDemo, onLeaveDemo, onNavigate, directions }) {
  const mapCredits=<><a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> · <a href="https://www.openmaptiles.org" target="_blank" rel="noreferrer">OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></>;
  const online=useOnline(),tonight=useTonight();
  const [tonightOpen,setTonightOpen]=useState(false),[detailsExpanded,setDetailsExpanded]=useState(false);
  const listRef=useRef(null), listScroll=useRef(0), returnFocus=useRef(null), selectionEntry=useRef(null), dismissTarget=useRef(true);
  const [filtersOpen,setFiltersOpen]=useState(false);
  const [kitOpen, setKitOpen] = useState(false), [listOpen, setListOpen] = useState(false);
  const [previewId,setPreviewId]=useState(null);
  const [time, setTime] = useState("any"), [clusterIds, setClusterIds] = useState(null);
  const [visibleCount, setVisibleCount] = useState(12);
  const [feedMode,setFeedMode] = useState("all");
  useEffect(() => { setFeedMode("all"); setTime("any"); setPreviewId(null); listScroll.current=0; }, [city.lat, city.lng]);
  useLayoutEffect(()=>{if(listOpen && !selected && listRef.current){listRef.current.scrollTop=listScroll.current;const button=listRef.current.querySelector(`[data-place-id="${CSS.escape(returnFocus.current||'')}"]`);button?.focus({preventScroll:true});}},[selected,listOpen]);
  const hasEditorial = places.some(p=>p.recommendation?.text);
  const ranked = useMemo(() => rankRecommendations(rankPlaces(mapLayer === "discover" && !demoMode ? places.filter(place => !isSuppressedVenue(place) && matchesVenueMood(place, category) && (feedMode !== "picks" || !!place.recommendation?.text)) : places, outings, "all", time),outings), [places, outings, category, time, mapLayer, demoMode,feedMode,hasEditorial,online]);
  const shortlist = ranked.slice(0, visibleCount);
  useEffect(() => { setVisibleCount(12); setClusterIds(null); }, [category, time, result,feedMode]);
  const isShortlist = mapLayer === "discover" && !clusterIds;
  const listPlaces = clusterIds ? ranked.map(item => item.place).filter(place => clusterIds.includes(place.id)) : mapLayer === "discover" ? (isShortlist ? shortlist : ranked).map(item => item.place) : places;
  // The map and list share the full filtered collection. Cards appear only
  // after an explicit pin selection, including venues outside editorial picks.
  const mapPlaces=useMemo(()=>ranked.map(item=>item.place),[ranked]);
  const active=mapPlaces.find(place=>place.id===previewId);
  const selectedPlan = selected && plans.find(outing => outing.place.id === selected.id);
  const selectedMemory = selected && memories.find(outing => outing.place.id === selected.id);
  const controlsDiffer = result && !demoMode && ((result.category !== "all" && result.category !== category) || result.radius !== Number(radius) || result.center?.lat !== Math.round(city.lat * 100) / 100 || result.center?.lng !== Math.round(city.lng * 100) / 100);
  useEffect(() => { if(mapLayer!=="discover")setListOpen(true); setClusterIds(null); }, [result, mapLayer]);
  useEffect(()=>{const back=()=>{if(!selectionEntry.current)return;selectionEntry.current=null;onSelect(null);setListOpen(dismissTarget.current);dismissTarget.current=true;};window.addEventListener('popstate',back);return()=>window.removeEventListener('popstate',back);},[onSelect]);
  function select(place,expanded=false) { setDetailsExpanded(expanded);setTonightOpen(false); if(!selected){dismissTarget.current=listOpen;const token=Date.now()+':'+place.id;selectionEntry.current=token;history.pushState({...history.state,bordoneSelection:token},'',location.href);} if(listRef.current)listScroll.current=listRef.current.scrollTop;returnFocus.current=place.id;onSelect(place); setKitOpen(false); setListOpen(false); }
  function closeDetails(showResults=true){setPreviewId(null);dismissTarget.current=showResults;onSelect(null);setListOpen(showResults);if(selectionEntry.current && history.state?.bordoneSelection===selectionEntry.current)history.back();else selectionEntry.current=null;}
  const selectionIndex=ranked.findIndex(item=>item.place.id===selected?.id);
  function stepPlace(offset){const item=ranked[selectionIndex+offset];if(item)onSelect(item.place);}
  function clearMapSelection(){setTonightOpen(false);setPreviewId(null);if(selected)closeDetails(false);}
  const sourceDate = result?.sourceUpdatedAt && new Date(result.sourceUpdatedAt).toLocaleDateString(undefined, {month:"short",day:"numeric",year:"numeric",timeZone:"UTC"});
  const searchFailure = searchError && <div className="world-search-error" role="alert"><button className="icon-button" aria-label="Dismiss search error and keep exploring" onClick={onDismissError}>×</button><strong>Couldn’t refresh places.</strong><details><summary>Details</summary><p>{searchError}</p></details><button className="text-button" disabled={searchBusy} onClick={() => onSearch(true)}>Try again</button></div>;
  return <section className={`world-screen living-city ${!listOpen&&!kitOpen&&!tonightOpen&&!filtersOpen&&!selected&&active?"show-dock":""} ${selected ? "has-selection" : ""}`} aria-label="Explore your world">
    <div className="world-canvas">
      {mapVisible ? <Map theme={theme} center={result?.center || city} places={mapPlaces} fitPlaces={mapPlaces} photoPins selectionSurface={selected?"details":"dock"} selected={selected?.id||active?.id} onClearSelection={clearMapSelection} onSelect={place=>{if(selected)closeDetails(false);setPreviewId(place.id);setListOpen(false);setTonightOpen(false);}} layer={mapLayer} outings={outings} onUnavailable={() => setListOpen(true)} onCluster={group => { setClusterIds(group.map(place => place.id)); setListOpen(true); onSelect(null);setPreviewId(null); }} /> : <div className="world-map-off"><button onClick={() => onMapVisible(true)}>Show map</button></div>}
    </div>
    <div className="world-toolbar">
      <button className="world-location" aria-expanded={kitOpen} onClick={() => { setPreviewId(null); if(selected)closeDetails(false); setTonightOpen(false); setFiltersOpen(false);setKitOpen(!kitOpen); setListOpen(false); onSelect(null); }}>{demoMode ? "Sample" : result?.corridor ? "Pittsburgh" : city.name} <span aria-hidden="true">⌄</span></button>
      {!demoMode&&<button className="tonight-toggle" aria-label={`Tonight, ${tonight.places.length} saved places`} aria-expanded={tonightOpen} onClick={()=>{setFiltersOpen(false);setTonightOpen(!tonightOpen);setListOpen(false);setKitOpen(false);setPreviewId(null);if(selected)closeDetails(false);}}>Tonight{tonight.places.length>0&&<span>{tonight.places.length}</span>}</button>}
      <div className="map-view-switch" aria-label="Discovery view"><button aria-label="Map view" aria-pressed={!listOpen} onClick={()=>{setFiltersOpen(false);clearMapSelection();setListOpen(false);setKitOpen(false);}}><img src="/world/icons/map-trifold.svg" alt=""/></button><button aria-label="List view" aria-pressed={listOpen} onClick={()=>{setFiltersOpen(false);setTonightOpen(false);setKitOpen(false);selected?closeDetails(true):setListOpen(true);}}><img src="/world/icons/list.svg" alt=""/></button></div>
      {demoMode && <button onClick={() => {setKitOpen(false);onLeaveDemo();}}>Leave demo</button>}
    </div>
    {tonightOpen&&!filtersOpen&&!selected&&<section className="world-sheet tonight-panel" aria-label="Tonight's shortlist">
      <div className="sheet-heading"><h2>Tonight</h2><button className="icon-button" aria-label="Close Tonight" onClick={()=>setTonightOpen(false)}>×</button></div>
      {tonight.places.length?tonight.places.map(place=><div className="tonight-row" key={place.id}><button className="tonight-place-open" onClick={()=>select(place,true)}>{venuePhoto(place,online)&&<img src={venuePhoto(place,online).url} alt="" referrerPolicy="no-referrer"/>}<span><strong>{place.name}</strong><small>{place.category?.replaceAll('_',' ')}</small></span></button><button className="tonight-remove" aria-label={`Remove ${place.name} from Tonight`} onClick={()=>tonight.toggle(place)}>×</button></div>):<p className="tonight-empty">Tap the bookmark on a place to save it here.</p>}
      <p className="tonight-reset">Resets at 5 am. Save a plan to keep a place.</p>
    </section>}
    {tonight.error&&<div className="tonight-error" role="alert">{tonight.error}</div>}
    {!selected&&!active&&!kitOpen&&!tonightOpen&&!listOpen&&!filtersOpen&&<button className="map-filter-button" onClick={()=>setFiltersOpen(true)}>Filters{category!=='all'?' · '+(VENUE_MOODS.find(m=>m.category===category)?.label||category):''}</button>}
    {filtersOpen&&<section className="world-sheet discovery-filters" aria-label="Filter places" onKeyDown={event=>{if(event.key==='Escape')setFiltersOpen(false);}}>
      <div className="sheet-heading"><h2>What sounds good?</h2><button className="icon-button" aria-label="Close filters" onClick={()=>setFiltersOpen(false)}>×</button></div>
      <div className="category-choices" aria-label="Type of outing">{[{category:'all',label:'Everything'},...VENUE_MOODS].map(kind=><button key={kind.category} aria-pressed={category===kind.category} onClick={()=>{onCategory(kind.category);onLayer('discover');setPreviewId(null);}}><span>{kind.label}</span><small>{places.filter(p=>!isSuppressedVenue(p)&&matchesVenueMood(p,kind.category)).length}</small></button>)}</div>
      <label className="filter-time">Distance from search center<select value={time} onChange={event=>setTime(event.target.value)}>{DISTANCE_CHOICES.map(choice=><option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label>
      <p className="hint">Straight-line distance, not travel time.</p>
      <details className="quiet-details"><summary>Map & offline</summary>
        <label>Show on map<select value={mapLayer} onChange={event => onLayer(event.target.value)}><option value="discover">Discover</option><option value="planned">Plans · {plans.length}</option><option value="visited">Memories · {memories.length}</option></select></label>
        <button className="text-button" onClick={() => onMapVisible(!mapVisible)}>{mapVisible ? "Hide map" : "Show map"}</button>
        {!demoMode && !result?.corridor && <button className="text-button" disabled={searchBusy} onClick={onDownloadArea}>Save area for offline use</button>}
        
        {!demoMode && <button className="text-button" onClick={() => {setKitOpen(false);onDemo();}}>Try sample places</button>}
      </details>
      <div className="filter-footer"><button className="text-button" onClick={()=>{onCategory('all');setTime('any');setFeedMode('all');onLayer('discover');}}>Reset</button><button onClick={()=>{setFiltersOpen(false);setKitOpen(false);}}>Show {ranked.length} places</button></div>
      <div className="filter-attribution">{mapCredits}</div>
    </section>}
    {kitOpen && !filtersOpen && <section className="world-sheet world-kit" aria-label="Choose your area" onKeyDown={event=>{if(event.key==='Escape')setKitOpen(false);}}>
      <div className="sheet-heading"><h2>Your area</h2><button className="icon-button" aria-label="Close area settings" onClick={() => setKitOpen(false)}>×</button></div>
      {!demoMode && <button className="city-result" onClick={()=>{onCorridor();setKitOpen(false);setListOpen(false);}}><span><strong>Explore Pittsburgh & nearby</strong><small>South Hills · Southpointe · Downtown</small></span><span aria-hidden="true">↗</span></button>}
      <p className="area-region-description">Our Pittsburgh guide includes the South Hills and Southpointe. Visiting somewhere else? Search below.</p>
      <form className="city-search" onSubmit={onSearchCities}><label htmlFor="city">Search another city</label><div><input id="city" value={demoMode ? "Sample neighborhood" : cityText} disabled={demoMode} onChange={event=>onCityText(event.target.value)} maxLength={120} required/><button className="secondary" disabled={cityBusy||demoMode}>{cityBusy?'Finding…':'Search'}</button></div></form>
      {cityError && <p className="notice error" role="alert">{cityError}</p>}
      {cityMatches && <div className="city-results"><strong>{cityMatches.length?'Choose a city':'No matching cities. Try a nearby city.'}</strong>{cityMatches.map(match=><button className="city-result" key={match.id} onClick={()=>{onChooseCity(match);setKitOpen(false);setListOpen(true);}}>{match.label}</button>)}</div>}
      {!result?.corridor&&<div className="world-area-row"><label>Search radius<select value={radius} disabled={demoMode} onChange={event=>onRadius(event.target.value)}><option value="1500">1.5 km</option><option value="3000">3 km</option><option value="5000">5 km</option></select></label><button className="secondary" disabled={geoBusy||demoMode} onClick={onGeolocate}>{geoBusy?'Locating…':'Use my area'}</button></div>}



    </section>}
    {listOpen && !kitOpen && !filtersOpen && !selected && <section ref={listRef} onScroll={event=>{listScroll.current=event.currentTarget.scrollTop;}} className="world-sheet world-place-list" aria-label="Places to explore" aria-busy={searchBusy}>
      <div className="sheet-heading"><h2>{clusterIds ? "Nearby places" : mapLayer === "planned" ? "Your plans" : mapLayer === "visited" ? "Your memories" : hasEditorial && feedMode === "picks" ? "In the guide" : `Around ${result?.corridor ? "Pittsburgh" : city.name}`}</h2><button className="icon-button" aria-label="Close place list" onClick={() => setListOpen(false)}>×</button></div>
      {mapLayer === "discover" && hasEditorial && <div className="feed-tabs" aria-label="Discovery view"><button aria-pressed={feedMode==="all"} onClick={()=>setFeedMode("all")}>Explore</button><button aria-pressed={feedMode==="picks"} onClick={()=>setFeedMode("picks")}>Guide entries</button></div>}
      <div className="feed-tools"><span>{ranked.length} places</span><button className="filter-link" onClick={()=>setFiltersOpen(true)}>Filters{category!=='all'?' · '+(VENUE_MOODS.find(m=>m.category===category)?.label||category):''}</button></div>

      {searchFailure}
      {searchBusy && <p className="hint" role="status">{searchPhase}</p>}
      {listPlaces.length ? <div className="place-feed">{listPlaces.map(place => <PlaceCard key={place.id} item={ranked.find(item=>item.place.id===place.id)||{place}} onSelect={select} planned={plans.some(o=>o.place.id===place.id)} visited={memories.some(o=>o.place.id===place.id)}/>)}</div> : <div className="world-empty"><p>{searchBusy ? "Finding places nearby…" : searchError ? "Places couldn’t load. Try again or add a place you know." : "No places match this filter."}</p>{hasEditorial && feedMode==="picks" && <button className="text-button" onClick={()=>setFeedMode("all")}>Browse all venues</button>}</div>}

      <div className="list-actions">
        {isShortlist && ranked.length > visibleCount && <button className="feed-more" onClick={() => setVisibleCount(visibleCount + 12)}>More places <span aria-hidden="true">↓</span></button>}
        {clusterIds && <button className="text-button" onClick={() => setClusterIds(null)}>All places</button>}
        <button className="text-button" disabled={!canEdit} onClick={onManual}>+ Add a place</button>
      </div>
      {mapLayer === "discover" && result && <details className="quiet-details"><summary>{demoMode ? "About these sample places" : result.offlineArea ? `${result.bundled ? "Included city guide" : "Saved map data"}${sourceDate ? ` · ${sourceDate}` : ""}` : "About these places"}</summary>
        {isShortlist && <p>{time === "any" ? "No distance limit." : `Within ${DISTANCE_CHOICES.find(choice => choice.value === time).maxKm} km of the search center.`} Straight-line distance, not travel time. Your ratings, dated guide entries, activity variety and distance influence the order. Photos are a small tie-breaker. Guide dates describe source edits, not verified opening hours.</p>}
        
        <p>{demoMode ? "Fictional places, separate from your journal." : `${result.providerName} · Retrieved ${new Date(result.fetchedAt).toLocaleString()}. Hours and availability may be unknown.`}</p>
        {result.stale && <p>Saved results may be out of date.</p>}
        {controlsDiffer && <p>Filtering previous results. Search again to refresh your chosen area and mood.</p>}
        <p>{result.attribution || "© OpenStreetMap contributors"}</p>
        {!demoMode && !result?.corridor && <button className="text-button" disabled={searchBusy} onClick={() => onSearch(true)}>Refresh places</button>}
      </details>}
    </section>}
    {!listOpen&&!kitOpen&&!tonightOpen&&!filtersOpen&&!selected&&active&&<PlaceDock onSaveVisit={onSaveVisit} place={active} onDetails={select} onPlan={onPlan} ready={canEdit} plans={plans} onVisit={onVisit} onDismiss={clearMapSelection} onExpand={place=>select(place,true)} tonight={tonight.places} onTonight={demoMode?null:tonight.toggle} directions={directions}/>}
    {selected && <PlaceInspector onSaveVisit={()=>onSaveVisit(selected)} initialExpanded={detailsExpanded} savedTonight={tonight.places.some(p=>p.id===selected.id)} onTonight={demoMode?null:()=>tonight.toggle(selected)} place={selected} plan={selectedPlan} memory={selectedMemory} ready={canEdit} onClose={()=>closeDetails(true)} onDismiss={()=>closeDetails(false)} position={selectionIndex>=0?`${selectionIndex+1} / ${ranked.length}`:""} onPrevious={selectionIndex>0?()=>stepPlace(-1):null} onNext={selectionIndex>=0 && selectionIndex<ranked.length-1?()=>stepPlace(1):null} onPlan={() => onPlan(selected)} onVisit={() => onVisit(selectedPlan)} onMemory={() => onMemory(selectedMemory)} directions={directions(selected)}/>}
    {(!listOpen || kitOpen || filtersOpen || selected) && searchFailure}


  </section>;
}
