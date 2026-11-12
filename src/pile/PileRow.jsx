import React from "react";
import { distanceText, placeLine } from "../city/placeText";
import { Icon, kindIcon } from "../ui";
import { ageWords, clockText, kmFrom, shortAge, sourceName } from "./pile";

// One save in the list. Unplaced saves show their words in quotes and a
// "Find it" button; placed ones show the place and the save's age.
export default function PileRow({ save, place, near, today, now, showClock, canEdit, onOpen, onFind }) {
  const text = save.source?.text?.trim() || "";
  const clock = showClock ? clockText(save, today) : "";
  let title, fact, glyph;
  if (save.place) {
    title = save.place.name;
    const km = kmFrom(near, place);
    fact = [placeLine(place), km === null ? "" : distanceText(km)].filter(Boolean).join(", ");
    glyph = kindIcon(place?.category || save.place.category);
  } else {
    title = text ? `“${text}”` : sourceName(save);
    const age = ageWords(save.source?.savedAt || save.createdAt, now);
    // A bare link already has its source as the title.
    fact = !text ? age[0].toUpperCase() + age.slice(1) : `${save.source?.url ? sourceName(save) : "Your note"}, ${age}`;
    glyph = save.source?.url ? "link" : "note";
  }
  return (
    <li className={`pile-row${save.place ? "" : " pile-row-loose"}`}>
      <button type="button" className="pile-row-main" onClick={() => onOpen(save)}>
        <span className="pile-glyph" aria-hidden="true"><Icon name={glyph} size={20} /></span>
        <span className="pile-row-text">
          <span className="pile-row-title">{title}</span>
          <span className="pile-row-fact">
            {clock && <span className="pile-clock">{clock}</span>}
            {clock && fact ? " · " : ""}{fact}
          </span>
        </span>
        {save.place && (
          <span className="pile-age t-tab">
            <Icon name={save.source?.url ? "link" : "note"} size={13} />
            {shortAge(save.source?.savedAt || save.createdAt, now)}
          </span>
        )}
      </button>
      {!save.place && canEdit && <button type="button" className="pile-find-btn" onClick={() => onFind(save)}>Find it</button>}
    </li>
  );
}
