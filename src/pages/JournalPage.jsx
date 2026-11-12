// JournalPage — owner: builder C (with BoardPage, SettingsPage and src/done/).
//
// Contract: takes no props; reads everything from useApp() (src/app/AppContext.js):
//   done (memories, newest first), plans, drafts, actions.visit / edit / remove /
//   addPlan / saveVisit / manual / openEditor, canEdit, navigate, store, journal.
// Settings is reached only from the control in this page's header.
import React, { useState } from "react";
import { useApp } from "../app/AppContext";
import DraftRecovery from "../app/DraftRecovery";
import { placeLine } from "../city/placeText";
import { displayDate } from "../model";
import MemoryDetail from "../done/MemoryDetail";
import { Button, Row, SegmentedControl, kindIcon } from "../ui";
import "./JournalPage.css";

export default function JournalPage() {
  const app = useApp();
  const { done, plans, drafts, actions, canEdit, navigate, store, journal } = app;
  const [view, setView] = useState("done");
  const [open, setOpen] = useState(null);
  const memory = open && done.find((o) => o.id === open);
  if (memory) return <MemoryDetail memory={memory} canEdit={canEdit} actions={actions} onBack={() => setOpen(null)} />;
  const list = view === "done" ? done : plans;
  return (
    <>
      <header className="page-head">
        <h1 className="page-title">Journal</h1>
        <Button variant="text" icon="settings" aria-label="Settings" onClick={() => navigate("settings")} className="btn-icon" />
      </header>
      <DraftRecovery store={store} drafts={drafts} draftError={journal.draftError} setDraftError={journal.setDraftError} refreshDrafts={journal.refreshDrafts} canEdit={canEdit} setEditor={actions.openEditor} />
      <SegmentedControl label="Show" value={view} onChange={setView}
        options={[{ value: "done", label: `Done ${done.length}` }, { value: "planned", label: `Planned ${plans.length}` }]} />
      <div className="journal-list">
        {list.length === 0 && <p className="empty-line">{view === "done" ? "Nothing done yet" : "Nothing planned"}</p>}
        {view === "done" && done.map((outing) => (
          <Row key={outing.id} icon={kindIcon(outing.place.category)} accent="gold" title={outing.place.name}
            detail={placeLine(outing.place)} trail={displayDate(outing.visitDate)} onClick={() => setOpen(outing.id)} />
        ))}
        {view === "planned" && plans.map((outing) => (
          <Row key={outing.id} icon={kindIcon(outing.place.category)} accent="blue" title={outing.place.name}
            detail={outing.planDate ? displayDate(outing.planDate) : placeLine(outing.place)}
            trail={<Button variant="quiet" icon="check" disabled={!canEdit} onClick={() => actions.visit(outing)}>Went</Button>} />
        ))}
      </div>
      <Button variant="text" icon="add" disabled={!canEdit} onClick={() => actions.manual(view === "done")}>{view === "done" ? "Add a memory" : "Add a plan"}</Button>
    </>
  );
}
