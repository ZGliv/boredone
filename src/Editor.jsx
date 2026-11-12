import React, { useEffect, useRef, useState } from "react";
import { MAX_PHOTOS, localDate, validateOuting } from "./model";
import { resizePhoto, writeDraft, deleteDraft } from "./storage";
import Icon from "./ui/Icon.jsx";
export function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "wide" : ""}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-top">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close"
        >
          <Icon name="close" size={22} />
        </button>
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
function OutingEditor({ outing, onClose, onSave, isNew = false, people = [], recovery, draftsEnabled = true, onDraftsChanged = () => {}, draftStore={writeDraft,deleteDraft}, validate=validateOuting, preserveDate=false, syncEnabled=false }) {
  const [draft, setDraft] = useState(() => structuredClone(recovery?.outing || outing)),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [photoBusy, setPhotoBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  const errorRef=useRef(null);
  useEffect(()=>{
    if(!error)return;
    const frame=requestAnimationFrame(()=>errorRef.current?.scrollIntoView({block:'nearest',behavior:'instant'}));
    return()=>cancelAnimationFrame(frame);
  },[error]);
  const draftId=useRef(recovery?.id || crypto.randomUUID());
  const lastDraftStamp=useRef(recovery?.savedAt);
  const disposed=useRef(false);
  useEffect(()=>()=>{disposed.current=true;ended.current=true;clearTimeout(timer.current);},[]);
  const timer=useRef(), writes=useRef(Promise.resolve()), ended=useRef(false);
  const [draftStatus,setDraftStatus]=useState(recovery?'Draft restored':'');
  function record(value) { return {version:1,id:draftId.current,isNew,originalStamp:recovery?.originalStamp || outing.updatedAt,savedAt:new Date(Math.max(Date.now(),(Date.parse(lastDraftStamp.current)||0)+1)).toISOString(),previousSavedAt:lastDraftStamp.current,outing:value}; }
  function persist(value) {
    const next=writes.current.catch(()=>{}).then(()=>{if(ended.current&&disposed.current)throw Error("Editor closed.");return draftStore.writeDraft(record(value));}).then(saved=>{lastDraftStamp.current=saved.savedAt;return saved;});
    writes.current=next;
    return next;
  }
  useEffect(()=>{
    if(!draftsEnabled || !dirty || ended.current)return;
    setDraftStatus('Saving draft');
    timer.current=setTimeout(()=>{persist(draft).then(()=>{if(!ended.current)setDraftStatus('Draft saved');}).catch(e=>setDraftStatus(e.message));},250);
    return ()=>clearTimeout(timer.current);
  },[draft,dirty,draftsEnabled]);
  async function keepForLater() {
    setBusy(true);clearTimeout(timer.current);ended.current=true;
    try {await persist(draft);onDraftsChanged();onClose();}
    catch(e){ended.current=false;setError(e.message);setBusy(false);}
  }
  useEffect(() => {
    if (!dirty && !photoBusy) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, photoBusy]);
  function update(fields) {
    setDraft((d) => ({ ...d, ...fields }));
    setDirty(true);
  }
  async function close() {
    if (
      (dirty || photoBusy || recovery) &&
      !window.confirm("Discard changes?")
    )
      return;
    clearTimeout(timer.current);ended.current=true;
    try {await writes.current.catch(()=>{});if(draftsEnabled)await draftStore.deleteDraft(draftId.current,lastDraftStamp.current);onDraftsChanged();onClose();}
    catch(e){ended.current=false;setError(e.message);}
  }
  async function photos(event) {
    const files = [...event.target.files];
    event.target.value = "";
    if (files.length + draft.photos.length > MAX_PHOTOS) {
      setError(`${MAX_PHOTOS} photos max.`);
      return;
    }
    setPhotoBusy(true);
    setError("");
    try {
      const rejected = [];
      for (const file of files) {
        try { const photo=await resizePhoto(file);setDraft(d=>({...d,photos:[...d.photos,photo]}));setDirty(true); }
        catch(error) { rejected.push(`${file.name}: ${error.message}`); }
      }

      if(rejected.length)setError(rejected.join(' '));
    } catch (e) {
      setError(e.message);
    } finally {
      setPhotoBusy(false);
    }
  }
  async function submit(event, separate = false) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const next = validate({
        ...draft,
        ...(separate ? {id:crypto.randomUUID(),createdAt:new Date().toISOString()} : {}),
        updatedAt: new Date().toISOString(),
      },outing);
      clearTimeout(timer.current);ended.current=true;
      await writes.current.catch(()=>{});
      await onSave(next, recovery?.originalStamp || outing.updatedAt, separate || isNew, draftsEnabled?draftId.current:undefined,lastDraftStamp.current);
      onDraftsChanged();
    } catch (e) {
      ended.current=false;
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const memory = draft.status === "visited";
  return (
    <Modal
      title={
        memory ? "Done" : isNew ? "Plan" : "Edit plan"
      }
      onClose={busy ? () => {} : close}
    >
      <form onSubmit={submit} className={`editor ${memory ? "visit-editor" : ""}`}>
        <fieldset disabled={busy || photoBusy}>
          {draft.place.source === "You" ? (
            <>
              <label>
                Name
                <input
                  required
                  maxLength={180}
                  value={draft.place.name}
                  onChange={(e) =>
                    update({ place: { ...draft.place, name: e.target.value } })
                  }
                />
              </label>
              <label>
                Where
                <input
                  maxLength={600}
                  value={draft.place.address}
                  onChange={(e) =>
                    update({
                      place: { ...draft.place, address: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                Kind
                <input
                  maxLength={100}
                  value={draft.place.category}
                  onChange={(e) =>
                    update({
                      place: { ...draft.place, category: e.target.value },
                    })
                  }
                />
              </label>
            </>
          ) : (
            <div className="outing-summary">
              <span className="kicker">{draft.place.category}</span>
              <h3>{draft.place.name}</h3>
              {draft.place.address && <p>{draft.place.address}</p>}
            </div>
          )}
          {memory && <section className="visit-photo-picker">              <div className="photo-label">
                <span>
                  Photos{" "}
                  <small>
                    {draft.photos.length}/{MAX_PHOTOS}
                  </small>
                </span>
                <label className="button secondary file-button">
                  Add photos
                  <input
                    aria-label="Add photos"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={photos}
                  />
                </label>
              </div>
              <div className="photo-grid">
                {draft.photos.map((src, i) => (
                  <div key={src.slice(-50) + i}>
                    <img src={src} alt={`Memory photo ${i + 1}`} />
                    <button type="button" className="photo-cover" onClick={()=>update({photos:[src,...draft.photos.filter((_,index)=>index!==i)]})} aria-label={`Use photo ${i+1} as cover`}>{i===0?'Cover':'Set cover'}</button>
                    <button
                      type="button"
                      className="photo-remove"
                      aria-label={`Remove photo ${i + 1}`}
                      onClick={() =>
                        update({
                          photos: draft.photos.filter(
                            (_, index) => index !== i,
                          ),
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div></section>}
          <datalist id="journal-companions">{people.map(person=><option value={person} key={person}/>)}</datalist>
          <div className="form-row">
            <label>
              {memory ? "Date" : "When"}
              <input
                type="date"
                required={memory}
                max={memory ? (preserveDate&&outing.visitDate>localDate()?outing.visitDate:localDate()) : undefined}
                value={memory ? draft.visitDate : draft.planDate}
                onChange={(e) =>
                  update(
                    memory
                      ? { visitDate: e.target.value }
                      : { planDate: e.target.value },
                  )
                }
              />
            </label>
            <label>
              With
              <input
                maxLength={200}
                list="journal-companions"
                autoComplete="off"
                value={draft.with}
                onChange={(e) => update({ with: e.target.value })}
              />
            </label>
          </div>
          <details className="visit-extras" open={!memory || undefined}><summary>{memory ? "Notes and rating" : "Notes"}</summary>
          <label>
            Notes
            <textarea
              rows={4}
              maxLength={6000}
              value={draft.notes}
              onChange={(e) => update({ notes: e.target.value })}
            />
          </label>
          {memory && (
            <>
              <label>
                Rating
                <select
                  value={draft.rating}
                  onChange={(e) => update({ rating: Number(e.target.value) })}
                >
                  <option value="0">None</option>
                  <option value="5">Loved it</option>
                  <option value="4">Good</option>
                  <option value="3">Fine</option>
                  <option value="2">Meh</option>
                  <option value="1">Not again</option>
                </select>
              </label>

            </>
          )}
          </details>
        </fieldset>
        {draftsEnabled && draftStatus && <p className="hint" role="status">{draftStatus}</p>}
        {photoBusy && <p role="status">Preparing photos</p>}
        {error && (
          <p ref={errorRef} role="alert" className="notice error">
            {error}
          </p>
        )}
        {memory && /another tab/.test(error) && <button type="button" className="secondary" disabled={busy || photoBusy} onClick={()=>submit(null,true)}>Save as a separate visit</button>}
        <div className="dialog-actions">
          {draftsEnabled && <button type="button" className="text-button" disabled={busy || photoBusy} onClick={keepForLater}>Finish later</button>}
          <button
            type="button"
            className="secondary"
            onClick={close}
            disabled={busy}
          >
            Cancel
          </button>
          <button type="submit" disabled={busy || photoBusy}>
            {busy ? "Saving" : memory ? "Save to journal" : "Save plan"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
