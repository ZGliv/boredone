import React from "react";
import { distanceText, placeLine } from "../city/placeText";
import { Icon, PlaceThumb } from "../ui";
import { ageWords, clockText, kmFrom, saveTitle, shortAge, sourceName } from "./pile";

// One save in the list. Unplaced saves show their words in quotes and a
// "Find it" button; placed ones show the place and, at the end, the save's
// age, or in the dated groups (showClock) its date, so "today" never reads
// as "ends today".
export default function PileRow({ save, place, near, today, now, showClock, canEdit, onOpen, onFind }) {
  const text = save.source?.text?.trim() || "";
  const clock = showClock ? clockText(save, today) : "";
  let title, fact, glyph;
  if (save.place) {
    title = save.place.name;
    const km = kmFrom(near, place);
    fact = [placeLine(place), km === null ? "" : distanceText(km)].filter(Boolean).join(", ");
  } else {
    title = text ? `“${saveTitle(save)}”` : sourceName(save);
    const age = ageWords(save.source?.savedAt || save.createdAt, now);
    // A bare link already has its source as the title.
    fact = !text ? `Saved ${age}` : `${sourceName(save)} · Saved ${age}`;
    glyph = save.source?.url ? "link" : "note";
  }
  return (
    <li className={`pile-row${save.place ? "" : " pile-row-loose"}`}>
      <button type="button" className="pile-row-main" onClick={() => onOpen(save)}>
        {save.place
          ? <PlaceThumb place={place || save.place} state="saved" size={44} />
          : <span className="pile-glyph" aria-hidden="true"><Icon name={glyph} size={20} /></span>}
        <span className="pile-row-text">
          <span className="pile-row-title">{title}</span>
          <span className="pile-row-fact">
            {clock && !save.place && <><span className="pile-clock">{clock}</span> · </>}{fact}
          </span>
        </span>
        {save.place && (clock
          ? <span className="pile-when t-tab">{clock}</span>
          : (
            <span className="pile-age t-tab">{shortAge(save.source?.savedAt || save.createdAt, now)}</span>
          ))}
      </button>
      {!save.place && canEdit && <button type="button" className="pile-find-btn" onClick={() => onFind(save)}>Find it</button>}
    </li>
  );
}
