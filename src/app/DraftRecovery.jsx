import React from "react";
import { outingLabel } from "../saves";

// Unfinished outings saved on this device, shown above the journal pages.
export default function DraftRecovery({ store, drafts, draftError, setDraftError, refreshDrafts, canEdit, setEditor }) {
  return <>
          {draftError && <p className="notice error" role="alert">{draftError}</p>}
          {drafts.length>0 && <section className="draft-recovery" aria-label="Unfinished outings"><h2>Pick up where you left off</h2>{drafts.map(d=><div className="draft-row" key={d.id}><div><strong>{d.outing.place ? (d.outing.place.name || 'Unfinished outing') : outingLabel(d.outing)}</strong><p>{d.outing.photos.length} {d.outing.photos.length===1?"photo":"photos"} · Saved on this device</p></div><button className="secondary" disabled={!canEdit} onClick={()=>setEditor({outing:d.outing,isNew:d.isNew,recovery:d})}>Resume</button><button className="text-button" disabled={!canEdit} onClick={async()=>{if(!confirm('Discard this unfinished outing and its draft photos? Saved memories stay unchanged.'))return;try{await store.deleteDraft(d.id,d.savedAt);refreshDrafts();}catch(e){setDraftError(e.message);}}}>Discard</button></div>)}</section>}
  </>;
}
