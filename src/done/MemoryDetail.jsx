import React, { useState } from "react";
import { directions } from "../app/routes";
import { placeLine } from "../city/placeText";
import { Button } from "../ui";
import PhotoViewer from "./PhotoViewer";
import { longDay, verdictLabel } from "./boardView";
import "./done.css";

// One memory, full page, inside the Journal.
export default function MemoryDetail({ memory, canEdit, actions, onBack }) {
  const [viewing, setViewing] = useState(null);
  const [cover, ...rest] = memory.photos;
  const year = memory.visitDate.slice(0, 4) !== String(new Date().getFullYear()) ? ` ${memory.visitDate.slice(0, 4)}` : "";
  return (
    <article className="memory">
      <Button variant="text" icon="back" className="memory-back" onClick={onBack}>Journal</Button>
      {cover && (
        <div className="memory-cover">
          <button type="button" aria-label="Open photo 1" onClick={() => setViewing(0)}><img src={cover} alt={`Photo 1 from ${memory.place.name}`} /></button>
        </div>
      )}
      <h1 id="memory-heading" className="memory-title" tabIndex={-1}>{memory.place.name}</h1>
      {verdictLabel(memory.rating) && <p className="memory-verdict">{verdictLabel(memory.rating)}</p>}
      <p className="memory-facts">
        {[`${longDay(memory.visitDate)}${year}`, memory.with && `With ${memory.with}`, placeLine(memory.place) || memory.place.address].filter(Boolean).join(" · ")}
      </p>
      {memory.notes && <p className="memory-notes">{memory.notes}</p>}
      {rest.length > 0 && (
        <div className="memory-strip">
          {rest.map((src, i) => (
            <button key={i} type="button" aria-label={`Open photo ${i + 2}`} onClick={() => setViewing(i + 1)}><img src={src} loading="lazy" alt={`Photo ${i + 2} from ${memory.place.name}`} /></button>
          ))}
        </div>
      )}
      <div className="memory-actions">
        <Button variant="quiet" disabled={!canEdit} onClick={() => actions.edit(memory)}>Edit</Button>
        <Button variant="quiet" disabled={!canEdit} onClick={() => actions.addPlan(memory.place)}>Plan again</Button>
        {(memory.place.lat != null || memory.place.address) && <Button variant="quiet" icon="directions" href={directions(memory.place)} aria-label="Directions" />}
        <Button variant="text" className="memory-delete" disabled={!canEdit} onClick={async () => { if (await actions.remove(memory)) onBack(); }}>Delete</Button>
      </div>
      {viewing != null && <PhotoViewer photos={memory.photos} index={viewing} name={memory.place.name} onIndex={setViewing} onClose={() => setViewing(null)} />}
    </article>
  );
}
