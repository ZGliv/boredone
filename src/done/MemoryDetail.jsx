import React from "react";
import Album from "../Album";
import { directions } from "../app/routes";
import { placeLine } from "../city/placeText";
import { displayDate } from "../model";
import { Button } from "../ui";

// One memory, full page, inside the Journal.
export default function MemoryDetail({ memory, canEdit, actions, onBack }) {
  return (
    <article className="memory">
      <Button variant="text" icon="back" className="memory-back" onClick={onBack}>Journal</Button>
      <h1 id="memory-heading" className="memory-title" tabIndex={-1}>{memory.place.name}</h1>
      <p className="memory-facts">
        {[displayDate(memory.visitDate), memory.rating > 0 && `${memory.rating}/5`, memory.with && `With ${memory.with}`, placeLine(memory.place)].filter(Boolean).join(" · ")}
      </p>
      {memory.notes && <p className="memory-notes">{memory.notes}</p>}
      <Album photos={memory.photos} name={memory.place.name} />
      <div className="memory-actions">
        <Button variant="quiet" disabled={!canEdit} onClick={() => actions.edit(memory)}>Edit</Button>
        <Button variant="quiet" disabled={!canEdit} onClick={() => actions.addPlan(memory.place)}>Plan again</Button>
        {memory.place.source !== "Sample" && <Button variant="quiet" icon="directions" href={directions(memory.place)}>Directions</Button>}
        <Button variant="text" disabled={!canEdit} onClick={async () => { if (await actions.remove(memory)) onBack(); }}>Delete</Button>
      </div>
    </article>
  );
}
