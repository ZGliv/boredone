import React, { useEffect, useRef, useState } from "react";
import { MAX_PHOTOS, localDate, validateOuting } from "./model";
import { resizePhoto } from "./storage";
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
          aria-label="Close dialog"
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function Editor({ outing, onClose, onSave, isNew = false }) {
  const [draft, setDraft] = useState(() => structuredClone(outing)),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [photoBusy, setPhotoBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function update(fields) {
    setDraft((d) => ({ ...d, ...fields }));
    setDirty(true);
  }
  function close() {
    if (
      (dirty || photoBusy) &&
      !window.confirm("Discard the changes to this outing?")
    )
      return;
    onClose();
  }
  async function photos(event) {
    const files = [...event.target.files];
    event.target.value = "";
    if (files.length + draft.photos.length > MAX_PHOTOS) {
      setError(`Keep up to ${MAX_PHOTOS} photos per memory.`);
      return;
    }
    setPhotoBusy(true);
    setError("");
    try {
      const next = [];
      for (const file of files) next.push(await resizePhoto(file));
      setDraft((d) => ({ ...d, photos: [...d.photos, ...next] }));
      setDirty(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setPhotoBusy(false);
    }
  }
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const next = validateOuting({
        ...draft,
        updatedAt: new Date().toISOString(),
      });
      await onSave(next, outing.updatedAt, isNew);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const memory = draft.status === "visited";
  return (
    <Modal
      title={
        memory ? "Keep the memory" : isNew ? "Make a plan" : "Edit your plan"
      }
      onClose={busy ? () => {} : close}
    >
      <form onSubmit={submit} className="editor">
        <fieldset disabled={busy || photoBusy}>
          {draft.place.source === "You" ? (
            <>
              <label>
                Place or activity
                <input
                  required
                  maxLength={180}
                  value={draft.place.name}
                  placeholder="An evening at the planetarium"
                  onChange={(e) =>
                    update({ place: { ...draft.place, name: e.target.value } })
                  }
                />
              </label>
              <label>
                Location
                <input
                  maxLength={600}
                  value={draft.place.address}
                  placeholder="A neighborhood, city or address"
                  onChange={(e) =>
                    update({
                      place: { ...draft.place, address: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                Category
                <input
                  maxLength={100}
                  value={draft.place.category}
                  placeholder="Outdoors, food, music…"
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
              <p>{draft.place.address || "Location saved with your plan"}</p>
            </div>
          )}
          <div className="form-row">
            <label>
              {memory ? "Date visited" : "When (optional)"}
              <input
                type="date"
                required={memory}
                max={memory ? localDate() : undefined}
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
              Who with? (optional)
              <input
                maxLength={200}
                placeholder="Just me, or your favorite people"
                value={draft.with}
                onChange={(e) => update({ with: e.target.value })}
              />
            </label>
          </div>
          <label>
            {memory ? "What do you want to remember?" : "Your plan"}
            <textarea
              rows={4}
              maxLength={6000}
              placeholder={
                memory
                  ? "The good parts, the unexpected parts, what you’d do again…"
                  : "What caught your eye? Anything to bring or book?"
              }
              value={draft.notes}
              onChange={(e) => update({ notes: e.target.value })}
            />
          </label>
          {memory && (
            <>
              <label>
                Would you go again?
                <select
                  value={draft.rating}
                  onChange={(e) => update({ rating: Number(e.target.value) })}
                >
                  <option value="0">Leave unrated</option>
                  <option value="5">5 · Absolutely</option>
                  <option value="4">4 · Glad I went</option>
                  <option value="3">3 · It was okay</option>
                  <option value="2">2 · Probably not</option>
                  <option value="1">1 · Not for me</option>
                </select>
              </label>
              <div className="photo-label">
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
              <p className="hint">
                Photos stay in this browser. We resize them and remove embedded
                location metadata. JPEG, PNG or WebP; no videos yet.
              </p>
              <div className="photo-grid">
                {draft.photos.map((src, i) => (
                  <div key={src.slice(-50) + i}>
                    <img src={src} alt={`Memory photo ${i + 1}`} />
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
              </div>
            </>
          )}
        </fieldset>
        {photoBusy && <p role="status">Preparing your photos…</p>}
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="secondary"
            onClick={close}
            disabled={busy}
          >
            Cancel
          </button>
          <button type="submit" disabled={busy || photoBusy}>
            {busy ? "Saving…" : memory ? "Save memory" : "Save plan"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
