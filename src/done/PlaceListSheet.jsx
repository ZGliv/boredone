import React from "react";
import { placeLine } from "../city/placeText";
import { Row, Sheet, kindIcon } from "../ui";
import { splitPlaces } from "./boardView";

const GROUPS = [["done", "Done", "gold"], ["pile", "On your pile", "blue"], ["rest", "Not yet", null]];

// The places in one set, neighbourhood or kind. A row opens it on the Map.
export default function PlaceListSheet({ title, places, states, count, onOpen, onClose }) {
  const split = splitPlaces(places, states);
  return (
    <Sheet title={title} onClose={onClose} className="place-list" headerExtra={<span className="place-list-count t-tab">{count}</span>}>
      {GROUPS.map(([key, label, accent]) => split[key].length > 0 && (
        <section key={key} className="place-list-group">
          <h3 className="t-caps place-list-label">{label}<span className="t-tab">{split[key].length}</span></h3>
          {split[key].map((place) => (
            <Row key={place.id} icon={kindIcon(place.category)} accent={accent || undefined} title={place.name}
              detail={placeLine(place)} onClick={() => onOpen(place)} />
          ))}
        </section>
      ))}
    </Sheet>
  );
}
