// JournalPage — owner: builder C (with BoardPage, SettingsPage and src/done/).
//
// Contract: takes no props; reads everything from useApp() (src/app/AppContext.js):
//   done (memories, newest first), plans, drafts, actions.visit / edit / remove /
//   addPlan / saveVisit / manual / openEditor, canEdit, navigate, store, journal.
// Settings is reached only from the control in this page's header.
// Plans (the old "Do it" tab) sit at the top, soonest first; memories follow,
// grouped by month. Every plan and memory in local storage shows here.
import React, { useState } from "react";
import { useApp } from "../app/AppContext";
import DraftRecovery from "../app/DraftRecovery";
import { placeLine } from "../city/placeText";
import { tonightDate } from "../pile/pile";
import MemoryDetail from "../done/MemoryDetail";
import { byMonth, factDate, monthName, shortDay, verdictLabel } from "../done/boardView";
import { Button, Icon, kindIcon } from "../ui";
import "../done/done.css";
import "./JournalPage.css";

export default function JournalPage() {
  const { done, plans, drafts, actions, canEdit, navigate, store, journal } = useApp();
  const [open, setOpen] = useState(null);
  const memory = open && done.find((o) => o.id === open);
  if (memory) return <MemoryDetail memory={memory} canEdit={canEdit} actions={actions} onBack={() => setOpen(null)} />;
  // The session day: a plan made for tonight stays "Tonight" until 5 am.
  const today = tonightDate();
  return (
    <div className="journal">
      <header className="page-head">
        <h1 className="page-title">Journal</h1>
        <Button variant="text" icon="settings" aria-label="Settings" onClick={() => navigate("settings")} />
      </header>
      <DraftRecovery store={store} drafts={drafts} draftError={journal.draftError} setDraftError={journal.setDraftError} refreshDrafts={journal.refreshDrafts} canEdit={canEdit} setEditor={actions.openEditor} />

      {plans.length > 0 && (
        <section className="journal-plans">
          <h2 className="t-caps section-label">Planned <span className="t-tab">{plans.length}</span></h2>
          {plans.map((plan) => {
            const when = plan.planDate === today ? "Tonight" : shortDay(plan.planDate);
            return (
              <div key={plan.id} className={`plan-row${plan.planDate === today ? " is-tonight" : ""}`}>
                <button type="button" className="plan-main" disabled={!canEdit} onClick={() => actions.edit(plan)}>
                  <Icon name={kindIcon(plan.place.category)} size={22} />
                  <span className="plan-text">
                    <span className="plan-name">{plan.place.name}</span>
                    <span className="plan-detail">{[when, placeLine(plan.place)].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
                <Button variant="quiet" icon="check" className="plan-done" disabled={!canEdit} onClick={() => actions.visit(plan)}>Done</Button>
              </div>
            );
          })}
        </section>
      )}

      {byMonth(done).map((group) => (
        <section key={group.month} className="journal-month">
          <h2 className="t-caps section-label">{monthName(group.month)} <span className="t-tab">{group.items.length}</span></h2>
          {group.items.map((item) => (
            <button key={item.id} type="button" className="entry" onClick={() => setOpen(item.id)}>
              {item.photos[0] ? <img className="entry-photo" src={item.photos[0]} alt="" loading="lazy" /> : <span className="entry-mark"><Icon name={kindIcon(item.place.category)} size={22} /></span>}
              <span className="entry-text">
                <span className="entry-name">{item.place.name}</span>
                <span className="entry-facts t-tab">{[factDate(item.visitDate), verdictLabel(item.rating), item.with && `with ${item.with}`].filter(Boolean).join(" · ")}</span>
                {item.notes && <span className="entry-note">{item.notes}</span>}
              </span>
            </button>
          ))}
        </section>
      ))}

      {!plans.length && !done.length && <p className="empty-line">Nothing done yet</p>}
      <div className="journal-add">
        <Button variant="text" icon="add" disabled={!canEdit} onClick={() => actions.manual(true)}>Add memory</Button>
        <Button variant="text" icon="add" disabled={!canEdit} onClick={() => actions.manual(false)}>Add plan</Button>
      </div>
    </div>
  );
}
