import React from "react";
import { outingLabel } from "../saves";
import { Button, useConfirm } from "../ui";

// Unfinished editor drafts saved on this device, shown in the Journal.
export default function DraftRecovery({ store, drafts, draftError, setDraftError, refreshDrafts, canEdit, setEditor }) {
  const confirm = useConfirm();
  async function discard(draft) {
    if (!(await confirm("Discard this draft?", { action: "Discard" }))) return;
    try { await store.deleteDraft(draft.id, draft.savedAt); refreshDrafts(); } catch (e) { setDraftError(e.message); }
  }
  return (
    <>
      {draftError && <p className="page-status" role="alert">{draftError}</p>}
      {drafts.length > 0 && (
        <section className="drafts" aria-label="Unfinished">
          <h2 className="t-caps section-label">Unfinished <span className="t-tab">{drafts.length}</span></h2>
          {drafts.map((d) => (
            <div className="draft-row" key={d.id}>
              <span className="draft-text">
                <span className="draft-name">{d.outing.place ? d.outing.place.name || "Unnamed" : outingLabel(d.outing)}</span>
                {d.outing.photos.length > 0 && <span className="draft-detail t-tab">{d.outing.photos.length} {d.outing.photos.length === 1 ? "photo" : "photos"}</span>}
              </span>
              <Button variant="quiet" disabled={!canEdit} onClick={() => setEditor({ outing: d.outing, isNew: d.isNew, recovery: d })}>Resume</Button>
              <Button variant="text" disabled={!canEdit} onClick={() => discard(d)}>Discard</Button>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
