import React from "react";
import Album from "../Album";
import MemoryTimeline from "../MemoryTimeline";
import { displayDate } from "../model";
import { directions } from "../app/routes";

// "Remember": the memory timeline, hidden (not unmounted) while one memory is open.
export default function MemoriesPage({ memories, canEdit, memoryDetail, actions, openMemory }) {
  return <div hidden={Boolean(memoryDetail)}><MemoryTimeline memories={memories} canEdit={canEdit} onAdd={()=>actions.manual(true)} onOpen={openMemory}/></div>;
}

// One memory, full page. Only ever set while the Memories page is showing.
export function MemoryDetail({ memoryDetail, canEdit, actions, setEditor, setMemoryDetail, closeMemory }) {
  return (
        <article className="memory-page">
          <button className="text-button" onClick={closeMemory}>← All memories</button>
          <h1 id="memory-heading" tabIndex={-1}>{memoryDetail.place.name}</h1>
          <p className="kicker">
            {displayDate(memoryDetail.visitDate)}
            {memoryDetail.rating > 0 && ` · ${memoryDetail.rating}/5`}
          </p>
          {memoryDetail.with && <p>With {memoryDetail.with}</p>}
          <p className="memory-notes">
            {memoryDetail.notes}
          </p>
          <Album photos={memoryDetail.photos} name={memoryDetail.place.name}/>
          <button className="text-button" disabled={!canEdit} onClick={()=>actions.saveVisit(memoryDetail.place)}>Save another visit here</button>
          <div className="button-row">
            {memoryDetail.place.source !== "Sample" && <a
              className="button secondary"
              href={directions(memoryDetail.place)}
              target="_blank"
              rel="noreferrer"
            >
              Open map ↗
            </a>}
            <button
              className="secondary"
              disabled={!canEdit}
              onClick={() => {
                setEditor({ outing: memoryDetail, isNew: false });
                setMemoryDetail(null);
              }}
            >
              Edit memory
            </button>
            <button
              disabled={!canEdit}
              onClick={() => {
                const place = memoryDetail.place;
                setMemoryDetail(null);
                actions.addPlan(place);
              }}
            >
              Plan another visit
            </button>
            <button
              className="text-button quiet"
              disabled={!canEdit}
              onClick={() => actions.remove(memoryDetail)}
            >
              Delete memory
            </button>
          </div>
        </article>
  );
}
