// PilePage — owner: builder B (with src/pile/).
//
// Contract: takes no props; reads everything from useApp() (src/app/AppContext.js):
//   saves (newest first), outings, places, placeById, city, cityStatus,
//   actions.put / actions.remove / actions.visit, canEdit, toast, navigate.
// Saves are outings with status "saved" (src/saves.js). Adding one stores it
// first, then asks POST /api/resolve-save and matches the answer against the
// city's places; whatever the resolver does, the save is already kept.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../app/AppContext";
import useHashTarget from "../app/useHashTarget";
import { placeForOuting } from "../city/cityPlaces";
import { count } from "../city/placeText";
import { localDate, validateOuting } from "../model";
import { clipText } from "../saveSource";
import { attachPlace, findDuplicate, makeSave, saveToPlan } from "../saves";
import { Icon } from "../ui";
import { AddSheet, CaptionSheet } from "../pile/AddSheet";
import ConfirmSheet from "../pile/ConfirmSheet";
import PileRow from "../pile/PileRow";
import SaveSheet from "../pile/SaveSheet";
import useHere from "../tonight/useHere";
import { ERROR_TEXT, candidateQueue, captionDates, fromLine, groupPile, readInput, requestResolve, tonightDate } from "../pile/pile";
import "@fontsource-variable/instrument-sans/wght-italic.css";
import "./PilePage.css";

const stamp = () => new Date().toISOString();
const DUPLICATE = { saved: "Already on pile", planned: "Already planned", visited: "Already done" };

export default function PilePage() {
  const { saves, outings, places, placeById, city, actions, canEdit, toast, ready } = useApp();
  // Only when location was already allowed (on the Map); the Pile never asks.
  const { here: position } = useHere();
  const [sheet, setSheet] = useState(null);
  const [busy, setBusy] = useState(false);
  const flow = useRef(0);
  const [target, clearTarget] = useHashTarget("pile");
  // "#pile/<save id>" (from Tonight's "Find the place") opens that save's search.
  useEffect(() => {
    if (!target || !ready) return;
    if (saves.some((s) => s.id === target)) setSheet({ type: "save", id: target, finding: true });
    clearTarget();
  }, [target, ready]);
  const now = new Date(), today = localDate(now);

  const placeOf = (save) => (save.place ? placeForOuting(save, places, placeById) || save.place : null);
  const groups = useMemo(() => groupPile(saves, { today, near: position, placeOf }), [saves, today, position, places]);
  const searchNear = position ? { ...position, city: city.name } : city.center ? { ...city.center, city: city.name } : null;
  const current = sheet ? outings.find((o) => o.id === sheet.id) : null;
  const placedCount = saves.filter((s) => s.place).length;

  const close = () => { flow.current += 1; setSheet(null); setBusy(false); };
  const store = async (next) => {
    if (await actions.put(next)) return next;
    throw new Error("Not saved");
  };
  const withSource = (save, change) => validateOuting({ ...save, source: { ...save.source, ...change }, updatedAt: stamp() });

  // Ask the resolver about a stored save and route its answer. Every failure
  // leaves the save as a note.
  async function lookUp(save) {
    const id = ++flow.current;
    // Nothing to match against yet; "Look up again" works once places are in.
    if (!places.length) { toast("Places loading. Kept as a note"); setSheet(null); return; }
    setBusy(true);
    const result = await requestResolve(
      { url: save.source?.url || "", text: save.source?.text || "", near: searchNear, today },
      { online: navigator.onLine !== false },
    );
    if (id !== flow.current) return;
    setBusy(false);
    if (result.status === "error") { toast(ERROR_TEXT[result.reason]); setSheet(null); return; }
    if (result.status === "needs-text") { setSheet({ type: "caption", id: save.id }); return; }
    const queue = candidateQueue(result.candidates, places, searchNear);
    if (queue.length) { setSheet({ type: "confirm", id: save.id, queue, index: 0 }); return; }
    const dates = captionDates(save, result.candidates[0]);
    if (dates) await store(withSource(save, dates)).catch(() => {});
    toast("No match. Kept as a note");
    setSheet(null);
  }

  async function add(value) {
    const { url, text } = readInput(value);
    const save = makeSave({ url, text });
    const twin = findDuplicate(outings, save);
    if (twin) {
      toast(DUPLICATE[twin.status]);
      setSheet(twin.status === "saved" ? { type: "save", id: twin.id } : null);
      return;
    }
    await store(save);
    await lookUp(save);
  }

  async function confirmYes() {
    const entry = sheet.queue[sheet.index];
    let next = attachPlace(current, entry.place);
    const dates = captionDates(next, entry.candidate);
    if (dates) next = withSource(next, dates);
    try { await store(next); } catch { return; }
    toast("Placed");
    close();
  }

  async function pick(save, place) {
    try { await store(attachPlace(save, place)); } catch { return false; }
    toast("Placed");
    return true;
  }

  async function caption(save, text) {
    const next = withSource(save, { text: clipText(text) });
    try { await store(next); } catch { return; }
    await lookUp(next);
  }

  async function tonight(save) {
    try { await store(saveToPlan(save, tonightDate())); } catch { return; }
    toast("On tonight's plan");
    close();
  }

  async function dates(save, change) {
    const next = { ...change };
    if (next.eventDate !== undefined && save.source.expiresAt && next.eventDate && save.source.expiresAt < next.eventDate) next.expiresAt = "";
    try { await store(withSource(save, next)); } catch { /* storage error banner says why */ }
  }

  const rows = (list, showClock) => list.map((save) => (
    <PileRow key={save.id} save={save} place={placeOf(save)} near={position} today={today} now={now} showClock={showClock} canEdit={canEdit}
      onOpen={(s) => setSheet({ type: "save", id: s.id })} onFind={(s) => setSheet({ type: "save", id: s.id, finding: true })} />
  ));
  const section = (label, list, showClock = false, className = "") => list.length > 0 && (
    <section className={`pile-group ${className}`} aria-label={label}>
      <h2 className="pile-sec"><span>{label}</span><span className="t-tab">{count(list.length)}</span></h2>
      <ul className="pile-list">{rows(list, showClock)}</ul>
    </section>
  );

  return (
    <>
      <header className="page-head pile-head">
        <div>
          <h1 className="page-title">Pile</h1>
          {saves.length > 0 && (
            <p className="pile-sum t-tab"><b>{count(saves.length)}</b> saved<span aria-hidden="true"> · </span><b>{count(placedCount)}</b> placed</p>
          )}
        </div>
        <button type="button" className="pile-add-btn" disabled={!canEdit} onClick={() => setSheet({ type: "add" })} aria-label="Save to pile">
          <Icon name="add" size={24} />
        </button>
      </header>

      {saves.length === 0 && <p className="empty-line">Nothing saved</p>}
      {section("Ending soon", groups.soon, true, "pile-group-soon")}
      {section("Not placed yet", groups.unplaced)}
      {section(groups.byDistance ? "Closest first" : "Newest first", groups.placed)}
      {section("Past", groups.past, true, "pile-group-past")}

      {sheet?.type === "add" && <AddSheet onSubmit={add} onClose={close} />}
      {sheet?.type === "caption" && current && (
        <CaptionSheet key={`caption-${current.id}`} source={fromLine(current, now)} onSubmit={(text) => caption(current, text)} onClose={close} />
      )}
      {sheet?.type === "confirm" && current && (
        <ConfirmSheet key={`confirm-${current.id}-${sheet.index}`} from={fromLine(current, now)} hasLink={!!current.source?.url}
          entry={sheet.queue[sheet.index]} index={sheet.index} total={sheet.queue.length} near={position}
          onYes={confirmYes} onKeep={close} onClose={close}
          onNext={() => setSheet(sheet.index + 1 < sheet.queue.length ? { ...sheet, index: sheet.index + 1 } : { type: "save", id: current.id, finding: true })} />
      )}
      {sheet?.type === "save" && current && (
        <SaveSheet key={`save-${current.id}`} save={current} place={placeOf(current)} near={position} now={now} cityName={city.name} places={places}
          canEdit={canEdit && current.status === "saved"} finding={sheet.finding} busy={busy}
          onDates={(change) => dates(current, change)} onPick={(place) => pick(current, place)} onLookUp={() => lookUp(current)}
          onTonight={() => tonight(current)} onDone={() => { close(); actions.visit(current); }}
          onRemove={async () => { if (await actions.remove(current)) close(); }} onClose={close} />
      )}
    </>
  );
}
