import React, { useEffect, useMemo, useRef, useState } from "react";
import { distanceText, placeLine } from "../city/placeText";
import { Button, Icon, Sheet, kindIcon } from "../ui";
import { ageWords, kmFrom, searchPlaces, sourceName } from "./pile";
import { longDay } from "../done/boardView";

// Searching the current city's places by name.
export function FindPlace({ places, near, cityName, onPick, focus = false }) {
  const [query, setQuery] = useState("");
  const input = useRef(null);
  // After the sheet has placed focus (its layout effect), so this wins.
  useEffect(() => { if (focus) input.current?.focus({ preventScroll: true }); }, []);
  const results = useMemo(() => searchPlaces(places, query, { near }), [places, query, near]);
  return (
    <div className="pile-search">
      <label className="sr-only" htmlFor="pile-search-input">Find a place</label>
      <div className="pile-search-field">
        <Icon name="place" size={18} />
        <input id="pile-search-input" ref={input} type="search" autoComplete="off" enterKeyHint="search" placeholder={`Search ${cityName}`}
          value={query} onChange={(event) => setQuery(event.target.value)} />
        {query && <button type="button" className="pile-search-clear" aria-label="Clear" onClick={() => { setQuery(""); input.current?.focus(); }}><Icon name="close" size={16} /></button>}
      </div>
      {results.length > 0 && (
        <ul className="pile-results">
          {results.map((place) => {
            const km = kmFrom(near, place);
            return (
              <li key={place.id}>
                <button type="button" onClick={() => onPick(place)}>
                  <Icon name={kindIcon(place.category)} size={20} />
                  <span className="pile-result-text">
                    <b>{place.name}</b>
                    <span>{[placeLine(place), km === null ? "" : distanceText(km)].filter(Boolean).join(", ")}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {query.trim().length >= 2 && !results.length && <p className="pile-none">Nothing by that name</p>}
    </div>
  );
}

function DateField({ label, value = "", min = "", disabled, onChange }) {
  return (
    <label className="field field-inline">
      <span>{label}</span>
      <em className={`field-fact t-tab${value ? "" : " is-empty"}`}>{value ? longDay(value) : "Not set"}</em>
      <input type="date" value={value} min={min || undefined} disabled={disabled}
        onClick={(event) => { try { event.currentTarget.showPicker?.(); } catch { /* Opens natively on touch. */ } }}
        onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function host(url) {
  try { return new URL(url).hostname.replace(/^(www|m)\./, ""); } catch { return ""; }
}

// One save: where it came from, its words, its dates, its place, and what to do with it.
export default function SaveSheet({ save, place, near, now, cityName, places, canEdit, finding: startFinding, busy, goLabel = "Go tonight", onDates, onPick, onLookUp, onTonight, onDone, onRemove, onClose }) {
  const [finding, setFinding] = useState(!!startFinding);
  const source = save.source || {};
  const km = kmFrom(near, place);
  const placed = !!save.place;
  const pick = async (next) => { if (await onPick(next)) setFinding(false); };
  return (
    <Sheet title={placed ? save.place.name : sourceName(save)} onClose={onClose} className="pile-sheet pile-detail">
      {placed && (
        <div className="pile-detail-place">
          <Icon name={kindIcon(place?.category || save.place.category)} size={20} />
          <span>{[placeLine(place || save.place), km === null ? "" : distanceText(km)].filter(Boolean).join(", ")}</span>
          {canEdit && !finding && <button type="button" className="pile-inline" onClick={() => setFinding(true)}>Change</button>}
        </div>
      )}

      {source.text && <blockquote className="pile-quote">{source.text}</blockquote>}
      <div className="pile-facts">
        {source.url && (
          <a className="pile-link" href={source.url} target="_blank" rel="noreferrer noopener">
            <Icon name="link" size={16} /><span>{placed || source.text ? sourceName(save) : host(source.url)}</span><Icon name="forward" size={14} />
          </a>
        )}
        <span className="pile-saved-at">Saved {ageWords(source.savedAt || save.createdAt, now)}</span>
      </div>

      {canEdit && (finding || !placed) && (
        <div className="pile-detail-find">
          <FindPlace focus={finding} places={places} near={near} cityName={cityName} onPick={pick} />
          {!placed && (source.url || source.text) && (
            <Button variant="text" onClick={onLookUp} disabled={busy}>{busy ? <span className="pile-reading">Reading</span> : "Look up again"}</Button>
          )}
        </div>
      )}

      <div className="pile-dates">
        <DateField label="Date" value={source.eventDate} disabled={!canEdit} onChange={(eventDate) => onDates({ eventDate })} />
        <DateField label="Ends" value={source.expiresAt} min={source.eventDate} disabled={!canEdit} onChange={(expiresAt) => onDates({ expiresAt })} />
      </div>

      {canEdit && (
        <div className="pile-detail-actions">
          {placed && <Button variant="primary" onClick={onTonight}>{goLabel}</Button>}
          {placed && <Button variant="quiet" icon="check" onClick={onDone}>Done</Button>}
          <Button variant="text" onClick={onRemove}>Delete</Button>
        </div>
      )}
    </Sheet>
  );
}
