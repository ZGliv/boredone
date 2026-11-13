import React from "react";
import Icon from "./Icon.jsx";
import { kindIcon } from "./icons.js";
import { atlasCell } from "../city/placePhotos.js";

// A place's square tile for list rows: its photo cut from the map's one photo
// atlas (no request of its own), or its kind icon on a tint when it has none.
// state: "done" (gold), "saved" | "planned" (blue, on your pile) or nothing.
// Decorative: the row beside it carries the name and state in words.
export default function PlaceThumb({ place, state, size = 48, className = "" }) {
  const tone = state === "done" ? "done" : state === "saved" || state === "planned" ? "pile" : "rest";
  const photo = atlasCell(place?.mapPhoto, size);
  return (
    <span className={`thumb thumb-${tone}${photo ? " thumb-photo" : ""} ${className}`} style={{ "--thumb": `${size}px` }} aria-hidden="true">
      {photo ? <span className="thumb-img" style={photo} /> : <Icon name={kindIcon(place?.category)} size={Math.round(size * 0.46)} />}
      {tone === "done" && <span className="thumb-check"><Icon name="check" size={10} /></span>}
    </span>
  );
}
