import React from "react";
import { placeLine } from "../city/placeText";
import { PlaceThumb, Row, Sheet } from "../ui";
import { splitPlaces } from "./boardView";

const GROUPS = [["done", "Done"], ["pile", "On your pile"], ["rest", "Not yet"]];

// The places in one set, neighbourhood or kind, each with its photo tile.
// A row opens it on the Map.
export default function PlaceListSheet({ title, places, states, count, onOpen, onClose }) {
  const split = splitPlaces(places, states);
  return (
    <Sheet title={title} onClose={onClose} className="place-list" headerExtra={<span className="place-list-count t-tab">{count}</span>}>
      {GROUPS.map(([key, label]) => split[key].length > 0 && (
        <section key={key} className={`place-list-group place-list-${key}`}>
          <h3 className="t-caps place-list-label">{label}<span className="t-tab">{split[key].length}</span></h3>
          {split[key].map((place) => (
            <Row key={place.id} lead={<PlaceThumb place={place} state={states.get(place.id)} />} title={place.name}
              detail={placeLine(place)} onClick={() => onOpen(place)} />
          ))}
        </section>
      ))}
    </Sheet>
  );
}
