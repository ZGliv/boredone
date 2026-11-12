import React, { useRef, useState } from "react";
import { Button, Sheet } from "../ui";

const canPaste = () => typeof navigator !== "undefined" && !!navigator.clipboard?.readText && window.isSecureContext;

// One field: a link, words, or both. onSubmit(value) resolves when the save
// is stored and looked up; the sheet shows "Reading" meanwhile.
export function AddSheet({ onSubmit, onClose }) {
  const [text, setText] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const field = useRef(null);
  async function paste() {
    try {
      const value = await navigator.clipboard.readText();
      if (value) setText(value.trim());
    } catch { /* Clipboard refused; the field is still there. */ }
    field.current?.focus();
  }
  async function submit(event) {
    event.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    try { await onSubmit(text); } catch (e) { setError(e.message); setBusy(false); }
  }
  return (
    <Sheet title="Save" onClose={onClose} className="pile-sheet">
      <form className="pile-add" onSubmit={submit}>
        <label className="sr-only" htmlFor="pile-add-input">Link or note</label>
        <textarea id="pile-add-input" ref={field} autoFocus rows={3} maxLength={4000} placeholder="Link or note" value={text} disabled={busy}
          onChange={(event) => { setText(event.target.value); setError(""); }}
          onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit(event); }} />
        {error && <p className="pile-error" role="alert">{error}</p>}
        <div className="pile-add-bar">
          {canPaste() && !text && <Button variant="quiet" onClick={paste}>Paste</Button>}
          <Button type="submit" variant="primary" className="pile-add-save" disabled={!text.trim() || busy}>
            {busy ? <span className="pile-reading">Reading</span> : "Save"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

// A link with no words: ask for them, once, in one field.
export function CaptionSheet({ source, onSubmit, onClose }) {
  const [text, setText] = useState(""), [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try { await onSubmit(text.trim()); } finally { setBusy(false); }
  }
  return (
    <Sheet title="What was it?" onClose={onClose} className="pile-sheet">
      <p className="pile-from">{source}</p>
      <form className="pile-add" onSubmit={submit}>
        <label className="sr-only" htmlFor="pile-caption-input">Name or caption</label>
        <input id="pile-caption-input" className="pile-input" autoFocus placeholder="Name or caption" value={text} disabled={busy} maxLength={2000}
          onChange={(event) => setText(event.target.value)} />
        <div className="pile-add-bar">
          <Button variant="text" onClick={onClose}>Keep as note</Button>
          <Button type="submit" variant="primary" className="pile-add-save" disabled={!text.trim() || busy}>
            {busy ? <span className="pile-reading">Reading</span> : "Look up"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
