import React from "react";
import { distanceText, placeLine } from "../city/placeText";
import { Button, Icon, Sheet, kindIcon } from "../ui";
import { kmFrom, reasonText } from "./pile";

// "Is this the place?" One candidate at a time, best first.
export default function ConfirmSheet({ from, hasLink, entry, index, total, near, onYes, onNext, onKeep, onClose, busy }) {
  const { place, reason } = entry;
  const km = kmFrom(near, place);
  const line = [placeLine(place), km === null ? "" : distanceText(km)].filter(Boolean).join(", ");
  const why = reasonText(reason, total);
  const photo = place.photo?.url && place.photo?.license ? place.photo : null;
  const last = index === total - 1;
  return (
    <Sheet label="Is this the place?" onClose={onClose} className="pile-sheet pile-confirm">
      <p className="pile-from"><Icon name={hasLink ? "link" : "note"} size={15} />{from}</p>
      <h2 className="pile-confirm-title">Is this the place?</h2>
      <div className="pile-cand">
        {photo
          ? <img className="pile-cand-photo" src={photo.url} alt="" />
          : <span className="pile-cand-glyph" aria-hidden="true"><Icon name={kindIcon(place.category)} size={30} /></span>}
        <div className="pile-cand-text">
          <b className="pile-cand-name">{place.name}</b>
          {line && <span>{line}</span>}
          {why && <span className="pile-match">{why}</span>}
        </div>
        {total > 1 && <span className="pile-of t-tab" aria-label={`${index + 1} of ${total}`}>{index + 1}<i>/</i>{total}</span>}
      </div>
      <div className="pile-actions">
        <Button variant="primary" onClick={onYes} disabled={busy}>Yes</Button>
        <Button variant="quiet" onClick={onNext} disabled={busy}>{last ? "Find it" : "Not this one"}</Button>
      </div>
      <Button variant="text" block onClick={onKeep}>Keep as note</Button>
      {photo && <p className="pile-credit">Photo: {[photo.author, photo.license].filter(Boolean).join(", ")}</p>}
    </Sheet>
  );
}
