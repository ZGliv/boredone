// PilePage — owner: builder B (with src/pile/).
//
// Contract: takes no props; reads everything from useApp() (src/app/AppContext.js):
//   saves (newest first), places, placeById, states, city, actions.put / actions.remove,
//   canEdit, toast.
// Saves are outings with status "saved" (src/saves.js: makeSave, attachPlace,
// saveToPlan, findDuplicate). The resolver is POST /api/resolve-save
// (server/resolve-save.js); "Is this the place?" belongs on this page.
import React, { useState } from "react";
import { useApp } from "../app/AppContext";
import { ageText, count, placeLine } from "../city/placeText";
import { findDuplicate, makeSave, outingLabel } from "../saves";
import { Button, Row, Sheet } from "../ui";
import "./PilePage.css";

const APP_NAMES = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", "google-maps": "Google Maps", web: "Link", note: "Note" };

export default function PilePage() {
  const { saves, outings, actions, canEdit, toast } = useApp();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Pile</h1>
          {saves.length > 0 && <p className="pile-count t-tab">{count(saves.length)} saved</p>}
        </div>
        <Button variant="primary" icon="add" disabled={!canEdit} onClick={() => setAdding(true)} aria-label="Add to pile" />
      </header>
      {saves.length === 0 && <p className="empty-line">Nothing saved</p>}
      {saves.map((save) => (
        <Row key={save.id} icon={save.source?.url ? "link" : "note"} accent="blue"
          title={outingLabel(save)}
          detail={save.place ? placeLine(save.place) : APP_NAMES[save.source?.app] || ""}
          trail={<span className="pile-age">{ageText(save.source?.savedAt || save.createdAt)}</span>} />
      ))}
      {adding && <AddSave onClose={() => setAdding(false)} onSave={async (save) => {
        const twin = findDuplicate(outings, save);
        if (twin) { toast("Already on your pile"); return true; }
        const ok = await actions.put(save);
        if (ok) toast("Saved");
        return ok;
      }} />}
    </>
  );
}

function AddSave({ onClose, onSave }) {
  const [text, setText] = useState(""), [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    let save;
    try {
      const link = /^\S+\.\S+$/.test(value) && !/\s/.test(value);
      save = makeSave(link ? { url: value } : { text: value });
    } catch (e) { setError(e.message); return; }
    if (await onSave(save)) onClose();
  }
  return (
    <Sheet title="Save" onClose={onClose}>
      <form className="pile-add" onSubmit={submit}>
        <label className="sr-only" htmlFor="pile-add-input">Link or note</label>
        <textarea id="pile-add-input" autoFocus rows={3} maxLength={2000} placeholder="Link or note" value={text}
          onChange={(event) => { setText(event.target.value); setError(""); }} />
        {error && <p className="pile-add-error" role="alert">{error}</p>}
        <Button type="submit" variant="primary" block disabled={!text.trim()}>Save</Button>
      </form>
    </Sheet>
  );
}
