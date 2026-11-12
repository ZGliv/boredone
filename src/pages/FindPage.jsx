import React, { useMemo } from "react";
import ExploreWorld from "../ExploreWorld";
import { journalPlaces } from "../exploration";
import { directions } from "../app/routes";

// "Find it": the map, the place list and the area controls.
export default function FindPage({ theme, discovery, library, canEdit, demoMode, plans, memories, actions, navigate, onDemo, onLeaveDemo, openMemoryFromFind }) {
  const { city, cityText, cityMatches, cityBusy, cityError, geoBusy, category, radius, result, searchBusy, searchPhase, searchError, selected, mapVisible, mapLayer,
    chooseCorridor, setCityText, searchCities, chooseCity, geolocate, setCategory, setRadius, searchPlaces, setSearchError, setSelected, setMapLayer, setMapVisible } = discovery;
  const visiblePlaces = useMemo(() => mapLayer === "discover"
    ? (result?.places || [])
    : journalPlaces(library.outings, mapLayer), [mapLayer, result, library.outings]);
  return <ExploreWorld theme={theme}
          city={city} cityText={cityText} cityMatches={cityMatches} cityBusy={cityBusy} cityError={cityError} geoBusy={geoBusy}
          category={category} radius={radius} result={result} searchBusy={searchBusy} searchPhase={searchPhase} searchError={searchError}
          selected={selected} mapVisible={mapVisible} mapLayer={mapLayer} canEdit={canEdit}
          plans={plans} memories={memories} outings={library.outings} places={visiblePlaces} demoMode={demoMode}
          onCorridor={chooseCorridor} onCityText={setCityText} onSearchCities={searchCities} onChooseCity={chooseCity} onGeolocate={geolocate}
          onCategory={setCategory} onRadius={(value) => { setRadius(value); searchPlaces(city, false, false, value); }}
          onSearch={(force = false) => searchPlaces(city, force)} onDownloadArea={() => searchPlaces(city, true, true)} onDismissError={() => setSearchError("")} onSelect={setSelected} onLayer={(value) => { setMapLayer(value); setSelected(null); }}
          onMapVisible={setMapVisible} onSaveVisit={actions.saveVisit} onPlan={actions.addPlan} onVisit={actions.visit} onMemory={openMemoryFromFind}
          onManual={() => actions.manual()} onDemo={onDemo} onLeaveDemo={onLeaveDemo} onNavigate={navigate} directions={directions}
        />;
}
