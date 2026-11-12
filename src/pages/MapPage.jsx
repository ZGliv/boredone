// MapPage — owner: builder A (with src/map/ and src/tonight/).
//
// Contract: takes no props; reads everything from useApp() (src/app/AppContext.js):
//   places, states, city, cityId, cities, setCityId, cityStatus, cityError, retryCity,
//   progress, saves, outings, actions, toast.
// Owner's rules here: the map opens with nothing selected; no numbered
// clusters; no carousels; sheets dismiss by swiping down; no +/- buttons or
// permanent info icon. Tonight's Three (src/decide.js) belongs on this page.
import React, { useState } from "react";
import { useApp } from "../app/AppContext";
import { directions } from "../app/routes";
import CitySwitcher from "../city/CitySwitcher";
import { count, placeLine } from "../city/placeText";
import WorldMap from "../map/WorldMap";
import { Button, Icon, Sheet, kindIcon } from "../ui";
import "./MapPage.css";

const STATE_TEXT = { done: "Done", planned: "Planned", saved: "On your pile" };

export default function MapPage() {
  const { places, states, city, cityId, cities, setCityId, cityStatus, retryCity, progress, actions, canEdit } = useApp();
  const [selected, setSelected] = useState(null);
  const center = city.center || { lat: 40.4406, lng: -79.9959 };
  const state = selected ? states.get(selected.id) : null;
  return (
    <div className="map-page">
      <WorldMap places={places} states={states} center={center} selectedId={selected?.id} onSelect={setSelected} />
      <header className="map-head">
        <CitySwitcher cities={cities} cityId={cityId} onChange={(id) => { setSelected(null); setCityId(id); }} />
        {progress && (
          <p className="map-count">
            <span className="map-count-done t-num">{count(progress.done)}</span>
            <span className="map-count-total">of {count(progress.total)}</span>
          </p>
        )}
        {cityStatus === "loading" && <p className="page-status" role="status">Loading places</p>}
        {cityStatus === "error" && <p className="page-status" role="alert">Places didn't load<button type="button" onClick={retryCity}>Retry</button></p>}
      </header>
      {selected && (
        <Sheet key={selected.id} title={selected.name} modal={false} onClose={() => setSelected(null)}
          headerExtra={<Icon name={kindIcon(selected.category)} className={`map-kind map-kind-${state || "none"}`} />}>
          <p className="map-place-line">{placeLine(selected)}</p>
          {state && <p className={`map-place-state map-place-${state}`}>{STATE_TEXT[state]}</p>}
          <div className="map-place-actions">
            <Button variant="primary" icon="check" disabled={!canEdit} onClick={() => actions.saveVisit(selected)}>Done</Button>
            <Button variant="quiet" disabled={!canEdit || state === "planned"} onClick={() => actions.addPlan(selected)}>Plan</Button>
            <Button variant="quiet" icon="directions" href={directions(selected)} aria-label="Directions" />
          </div>
        </Sheet>
      )}
    </div>
  );
}
