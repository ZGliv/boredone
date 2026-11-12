// MapPage — owner: builder A (with src/map/ and src/tonight/).
//
// Contract: takes no props; reads everything from useApp() (src/app/AppContext.js).
// Owner's rules here: the map opens with nothing selected; no numbered
// clusters; no carousels; sheets dismiss by swiping down; no +/- buttons or
// permanent info icon. Tonight's Three (src/decide.js) is docked at the bottom.
import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "../app/AppContext";
import { directions } from "../app/routes";
import useHashTarget from "../app/useHashTarget";
import CitySwitcher from "../city/CitySwitcher";
import { count, distanceText, placeLine } from "../city/placeText";
import WorldMap from "../map/WorldMap";
import { distance } from "../recommendations.js";
import { makeSave } from "../saves";
import TonightPanel from "../tonight/TonightPanel";
import { boardSets, doneEffect, doneIdsFrom, pickFact, shortDay } from "../done/boardView";
import { fromLine, tonightDate } from "../pile/pile";
import { closestSet, planFor, planFromPick, saveForPlace } from "../tonight/tonightModel";
import useHere from "../tonight/useHere";
import useTonight from "../tonight/useTonight";
import useTonightEvents from "../tonight/useTonightEvents";
import { Button, Icon, ProgressDots, Sheet, kindIcon } from "../ui";
import "./MapPage.css";

export default function MapPage() {
  const app = useApp();
  const { places, placeById, states, city, cityId, cities, setCityId, cityStatus, retryCity, progress, board, saves, outings, ready, actions, canEdit, toast } = app;
  const [selected, setSelected] = useState(null);
  const [follow, setFollow] = useState(0);
  const [mode, setMode] = useState("dock"), [openId, setOpenId] = useState(null), [panelHeight, setPanelHeight] = useState(0);
  const { here, status: hereStatus, locate } = useHere();
  const [target, clearTarget] = useHashTarget("map");
  // "#map/<place id>" (from the Board) opens that place.
  useEffect(() => {
    if (!target || !placeById.size) return;
    const place = placeById.get(target);
    if (place) { setSelected(place); setOpenId(null); }
    clearTarget();
  }, [target, placeById]);
  const center = city.center || { lat: 40.4406, lng: -79.9959 };
  const inCity = here && distance(here, center) <= (city.radiusKm || 10) + 15 ? here : null;
  const events = useTonightEvents({ center: inCity || center, radiusKm: inCity ? 8 : city.radiusKm || 10, places });
  const tonight = useTonight({ cityId, places, placeById, saves, outings, ready, here: inCity, events, center, radiusKm: city.radiusKm || 10 });
  const sets = useMemo(() => boardSets(board), [board]);
  const doneIds = useMemo(() => doneIdsFrom(states), [states]);
  const planOf = (pick) => planFor(pick, outings, { places, placeById });
  // What doing a pick would add to the board, for a pick with no other fact.
  const factOf = (pick) => (pick.place ? pickFact(doneEffect({ board, doneIds, place: pick.place, visitDate: tonightDate() })) : "");
  const near = useMemo(() => closestSet(sets, states), [sets, states]);
  const openPick = mode === "open" ? tonight.picks.find((p) => p.id === openId) : null;
  // A place sheet covers roughly the lower 300 px of the map.
  const focus = selected ? { lat: selected.lat, lng: selected.lng, key: `place-${selected.id}` }
    : openPick?.spot ? { lat: openPick.spot.lat, lng: openPick.spot.lng, key: `${openPick.id}@${Math.round(panelHeight / 40)}` }
    : follow && inCity ? { lat: inCity.lat, lng: inCity.lng, key: `here-${follow}` } : null;

  // One camera move to you per tap on the locate button, then the map is yours.
  useEffect(() => {
    if (!follow || !inCity) return;
    const timer = setTimeout(() => setFollow(0), 100);
    return () => clearTimeout(timer);
  }, [follow, inCity]);

  // Tonight's picks are a snapshot; planFromPick re-reads the save, so one
  // done or deleted elsewhere since is never overwritten.
  async function go(pick) {
    let plan;
    try { plan = planFromPick(pick, { outings, now: new Date(), places, placeById }); } catch (e) { toast(e.message); return; }
    if (!plan) { toast("No longer on your pile"); return; }
    await actions.put(plan);
  }

  return (
    <div className="map-page">
      <WorldMap places={places} states={states} center={center} here={inCity} focus={focus} padBottom={selected ? 300 : panelHeight}
        selectedId={selected?.id || openPick?.place?.id || null}
        onSelect={(place) => { setSelected(place); if (place) setOpenId(null); }} />
      <header className="map-head">
        <div className="map-head-row">
          <CitySwitcher cities={cities} cityId={cityId} onChange={(id) => { setSelected(null); setOpenId(null); setCityId(id); }} />
          <button type="button" className={`map-locate${hereStatus === "on" ? " map-locate-on" : ""}`} onClick={() => { locate(); setFollow((n) => n + 1); }}
            aria-label={hereStatus === "denied" ? "Location blocked" : "Use my location"} aria-pressed={hereStatus === "on"} disabled={hereStatus === "denied"}>
            <Icon name="locate" size={20} />
          </button>
        </div>
        {progress && (
          <p className="map-count" aria-label={`${count(progress.done)} of ${count(progress.total)} done`}>
            <span className="map-count-done t-num">{count(progress.done)}</span>
            <span className="map-count-total">of {count(progress.total)}</span>
          </p>
        )}
        {near && (
          <p className="map-set">
            <ProgressDots done={near.done} total={near.goal} />
            <span>{near.name}</span>
            <span className="map-set-left t-tab">{near.remaining} left</span>
          </p>
        )}
        {cityStatus === "loading" && <p className="page-status" role="status">Loading places</p>}
        {cityStatus === "error" && <p className="page-status" role="alert">Places didn't load<button type="button" onClick={retryCity}>Retry</button></p>}
      </header>

      {!selected && tonight.picks.length > 0 && (
        <TonightPanel key={cityId} tonight={tonight} mode={mode} setMode={setMode} openId={openId} setOpenId={setOpenId}
          planOf={planOf} factOf={factOf} canEdit={canEdit} onHeight={setPanelHeight}
          onGo={go} onDone={(plan) => actions.visit(plan)} />
      )}

      {selected && (
        <PlaceSheet place={selected} here={inCity} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function PlaceSheet({ place, here, onClose }) {
  const { states, saves, outings, places, placeById, actions, canEdit, toast } = useApp();
  const state = states.get(place.id) || null;
  const save = state === "saved" ? saveForPlace(place, saves, places, placeById) : null;
  const plan = state === "planned" ? planFor({ place }, outings, { places, placeById }) : null;
  const km = here ? distance(here, place) : null;
  const facts = [placeLine(place), km != null && distanceText(km)].filter(Boolean).join(" · ");
  const source = save ? fromLine(save) : "";
  const planned = plan ? (plan.planDate === tonightDate() ? "On tonight's plan" : plan.planDate ? `Planned ${shortDay(plan.planDate)}` : "Planned") : "Planned";
  async function addToPile() {
    let record;
    try { record = makeSave({ place }); } catch (e) { toast(e.message); return; }
    await actions.put(record);
  }
  return (
    <Sheet key={place.id} title={place.name} modal={false} onClose={onClose} className="place-sheet"
      headerExtra={<Icon name={kindIcon(place.category)} className={`map-kind map-kind-${state || "none"}`} />}>
      {facts && <p className="map-place-line t-tab">{facts}</p>}
      {state === "done" && <p className="map-place-state map-place-done"><Icon name="check" size={16} />Done</p>}
      {state === "planned" && <p className="map-place-state map-place-saved">{planned}</p>}
      {source && <p className="map-place-state map-place-saved">{source}</p>}
      <div className="map-place-actions">
        <Button variant="quiet" icon={state === "saved" ? "check" : "pile"} className={state === "saved" ? "map-saved" : ""}
          disabled={!canEdit || !!state} onClick={addToPile}>{state === "saved" ? "Saved" : "Save"}</Button>
        <Button variant="primary" icon="check" disabled={!canEdit}
          onClick={() => (plan ? actions.visit(plan) : save ? actions.visit(save) : actions.saveVisit(place))}>Done</Button>
        <Button variant="quiet" icon="directions" href={directions(place)} aria-label="Directions" />
      </div>
    </Sheet>
  );
}
