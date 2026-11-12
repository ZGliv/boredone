// The plan and Done sheets (owner: builder C). App renders <Editor> whenever
// actions.saveVisit / visit / addPlan / edit / manual / openEditor ask for it.
// A memory ("Done") shows what it does to the board, then "How was it?",
// who with, a note and photos. Swiping it away keeps an unfinished draft,
// listed in the Journal; only Save writes the journal.
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { MAX_PHOTOS, localDate, validateOuting } from "./model";
import { resizePhoto, writeDraft, deleteDraft } from "./storage";
import { AppContext } from "./app/AppContext";
import { count, placeLine } from "./city/placeText";
import { Button, Icon, ProgressDots, SegmentedControl, Sheet } from "./ui";
import { VERDICTS, doneEffect, doneIdsFrom, effectLines, hasName, longDay, toggleName } from "./done/boardView";
import "./done/done.css";

// Native dialog, still used by the account-removal confirmation.
export function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog ref={ref} className={wide ? "wide" : ""} aria-labelledby="dialog-title"
      onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <div className="dialog-top">
        <h2 id="dialog-title">{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close"><Icon name="close" size={22} /></button>
      </div>
      {children}
    </dialog>
  );
}

// The plan/memory form needs a venue. A save with no place yet has nothing to
// edit here, so close instead of rendering (the Pile UI handles saves).
export function canEdit(props) {
  return !!(props.recovery?.outing || props.outing)?.place;
}
export default function Editor(props) {
  const editable = canEdit(props);
  useEffect(() => { if (!editable) props.onClose?.(); }, [editable]);
  return editable ? <OutingEditor {...props} /> : null;
}

function OutingEditor({ outing, onClose, onSave, isNew = false, people = [], recovery, draftsEnabled = true, onDraftsChanged = () => {}, draftStore = { writeDraft, deleteDraft }, validate = validateOuting, preserveDate = false }) {
  const app = useContext(AppContext);
  const [draft, setDraft] = useState(() => structuredClone(recovery?.outing || outing)),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [photoBusy, setPhotoBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [person, setPerson] = useState("");
  const draftId = useRef(recovery?.id || crypto.randomUUID());
  const lastDraftStamp = useRef(recovery?.savedAt);
  const timer = useRef(), writes = useRef(Promise.resolve()), ended = useRef(false), disposed = useRef(false);
  useEffect(() => () => { disposed.current = true; ended.current = true; clearTimeout(timer.current); }, []);

  function record(value) {
    return { version: 1, id: draftId.current, isNew, originalStamp: recovery?.originalStamp || outing.updatedAt,
      savedAt: new Date(Math.max(Date.now(), (Date.parse(lastDraftStamp.current) || 0) + 1)).toISOString(), previousSavedAt: lastDraftStamp.current, outing: value };
  }
  function persist(value) {
    const next = writes.current.catch(() => {})
      .then(() => { if (ended.current && disposed.current) throw Error("Editor closed."); return draftStore.writeDraft(record(value)); })
      .then((saved) => { lastDraftStamp.current = saved.savedAt; return saved; });
    writes.current = next;
    return next;
  }
  useEffect(() => {
    if (!draftsEnabled || !dirty || ended.current) return;
    timer.current = setTimeout(() => { persist(draft).catch((e) => setError(e.message)); }, 250);
    return () => clearTimeout(timer.current);
  }, [draft, dirty, draftsEnabled]);
  useEffect(() => {
    if (!dirty && !photoBusy) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, photoBusy]);

  function update(fields) {
    setDraft((d) => ({ ...d, ...fields }));
    setDirty(true);
  }
  // Dismissing (swipe, scrim, Escape) keeps what was typed as a draft; an
  // untouched sheet leaves nothing behind.
  async function dismiss() {
    clearTimeout(timer.current);
    ended.current = true;
    try {
      if (draftsEnabled && (dirty || photoBusy)) { await persist(draft); onDraftsChanged(); }
      else {
        await writes.current.catch(() => {});
        if (draftsEnabled && !recovery) await draftStore.deleteDraft(draftId.current, lastDraftStamp.current);
        onDraftsChanged();
      }
    } catch { /* The draft stays listed; nothing in the journal changed. */ }
    onClose();
  }
  async function photos(event) {
    const files = [...event.target.files];
    event.target.value = "";
    if (files.length + draft.photos.length > MAX_PHOTOS) { setError(`${MAX_PHOTOS} photos max`); return; }
    setPhotoBusy(true);
    setError("");
    const rejected = [];
    for (const file of files) {
      try { const photo = await resizePhoto(file); setDraft((d) => ({ ...d, photos: [...d.photos, photo] })); setDirty(true); }
      catch (e) { rejected.push(e.message); }
    }
    if (rejected.length) setError(rejected.join(" "));
    setPhotoBusy(false);
  }
  async function submit(event, separate = false) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const next = validate({ ...draft, ...(separate ? { id: crypto.randomUUID(), createdAt: new Date().toISOString() } : {}), updatedAt: new Date().toISOString() }, outing);
      clearTimeout(timer.current);
      ended.current = true;
      await writes.current.catch(() => {});
      await onSave(next, recovery?.originalStamp || outing.updatedAt, separate || isNew, draftsEnabled ? draftId.current : undefined, lastDraftStamp.current);
      onDraftsChanged();
    } catch (e) {
      ended.current = false;
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const memory = draft.status === "visited";
  const typed = draft.place.source === "You";
  const wasDone = app?.outings?.find((o) => o.id === outing.id)?.status === "visited";
  const doneIds = useMemo(() => doneIdsFrom(app?.states), [app?.states]);
  const effect = useMemo(() => (memory && !wasDone && !typed ? doneEffect({ board: app?.board, doneIds, place: draft.place, visitDate: draft.visitDate }) : null),
    [memory, wasDone, typed, app?.board, doneIds, draft.place, draft.visitDate]);
  const lines = effectLines(effect);
  const shown = effect ? app.board.places[app.board.placeIndex[effect.placeId]] : null;
  const maxDate = memory ? (preserveDate && outing.visitDate > localDate() ? outing.visitDate : localDate()) : undefined;
  const known = people.slice(0, 8);
  const extra = (draft.with || "").split(",").map((s) => s.trim()).filter((n) => n && !known.some((k) => k.toLowerCase() === n.toLowerCase()));
  const addPerson = () => { if (person.trim() && !hasName(draft.with, person)) update({ with: toggleName(draft.with, person) }); setPerson(""); };
  const heading = memory ? (wasDone ? "Edit" : "Done") : isNew ? "Plan" : "Edit plan";

  return (
    <Sheet label={heading} onClose={busy ? () => {} : dismiss} className={`outing-sheet${memory ? " is-done" : ""}`}>
      <form onSubmit={submit} className="outing-form">
        <fieldset disabled={busy || photoBusy}>
          {typed ? (
            <div className="outing-typed">
              <label className="field field-name"><span>{heading}</span>
                <input required maxLength={180} placeholder="Name" value={draft.place.name} onChange={(e) => update({ place: { ...draft.place, name: e.target.value } })} /></label>
              <div className="field-pair">
                <label className="field"><span>Where</span>
                  <input maxLength={600} value={draft.place.address} onChange={(e) => update({ place: { ...draft.place, address: e.target.value } })} /></label>
                <label className="field"><span>Kind</span>
                  <input maxLength={100} value={draft.place.category} onChange={(e) => update({ place: { ...draft.place, category: e.target.value } })} /></label>
              </div>
            </div>
          ) : (
            <header className="outing-hero">
              <div>
                <p className="t-caps">{heading}</p>
                <h2 className="outing-name">{draft.place.name}</h2>
                {placeLine(shown || draft.place) && <p className="outing-line">{placeLine(shown || draft.place)}</p>}
              </div>
            </header>
          )}

          {lines && (
            <div className="outing-effect" role="status">
              <div className="outing-effect-row">
                {effect.set && <ProgressDots done={effect.set.done} total={effect.set.goal} className="dots-big" />}
                <p><b>{lines.name}, <span className="nowrap">{lines.tally}</span></b>{lines.tail && <span>{lines.tail}</span>}</p>
              </div>
              <p className="outing-effect-total t-tab"><span className="t-num">{count(effect.done)}</span> of {count(effect.total)} in {app.city?.name}</p>
            </div>
          )}

          <label className="field field-inline"><span>{memory ? "Date" : "When"}</span>
            <em className={`field-fact${(memory ? draft.visitDate : draft.planDate) ? "" : " is-empty"}`}>{longDay(memory ? draft.visitDate : draft.planDate) || "Any day"}</em>
            <input type="date" required={memory} max={maxDate} value={memory ? draft.visitDate : draft.planDate}
              onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* Opens natively on touch. */ } }}
              onChange={(e) => update(memory ? { visitDate: e.target.value } : { planDate: e.target.value })} />
          </label>

          {memory && (
            <section className="outing-verdict">
              <span className="field-label" aria-hidden="true">How was it</span>
              <SegmentedControl label="How was it?" value={draft.rating} onChange={(rating) => update({ rating: rating === draft.rating ? 0 : rating })}
                options={VERDICTS} className="verdicts" />
            </section>
          )}

          <div className="outing-with">
            <span className="field-label">With</span>
            {[...known, ...extra].map((name) => (
              <button key={name} type="button" className="chip" aria-pressed={hasName(draft.with, name)} onClick={() => update({ with: toggleName(draft.with, name) })}>{name}</button>
            ))}
            <input className="chip-input" aria-label="Add a name" placeholder="Name" maxLength={60} value={person}
              onChange={(e) => setPerson(e.target.value)} onBlur={addPerson}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addPerson(); } }} />
          </div>

          <label className="field field-note"><span className="sr-only">Note</span>
            <textarea rows={3} maxLength={6000} placeholder="Note" value={draft.notes} onChange={(e) => update({ notes: e.target.value })} /></label>

          {memory && (
            <div className="outing-photos">
              {draft.photos.map((src, i) => (
                <figure key={src.slice(-40) + i}>
                  <img src={src} alt={`Photo ${i + 1}`} />
                  <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => update({ photos: draft.photos.filter((_, n) => n !== i) })}><Icon name="close" size={16} /></button>
                </figure>
              ))}
              {draft.photos.length < MAX_PHOTOS && (
                <label className="photo-add">
                  <Icon name="add" size={20} /><span>{photoBusy ? "Preparing" : draft.photos.length ? "Photo" : "Add a photo"}</span>
                  <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={photos} />
                </label>
              )}
            </div>
          )}
        </fieldset>

        {error && <p className="outing-error" role="alert">{error}</p>}
        {memory && /another tab/.test(error) && <Button variant="quiet" block disabled={busy || photoBusy} onClick={() => submit(null, true)}>Save as new</Button>}
        <Button type="submit" variant="primary" block disabled={busy || photoBusy}>{busy ? "Saving" : memory ? "Save" : "Save plan"}</Button>
      </form>
    </Sheet>
  );
}
