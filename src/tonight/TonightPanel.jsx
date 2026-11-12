import React, { useEffect, useRef, useState } from "react";
import { directions } from "../app/routes";
import { sheetDragAction } from "../sheetGesture.js";
import { Button, Icon, SegmentedControl, kindIcon } from "../ui";
import { shortDay } from "../done/boardView";
import { COMPANY, ENERGY, pickDay, sessionDate } from "./tonightModel.js";
import "./tonight.css";

// Tonight's three, docked under the map. Three heights: "peek" (just the
// title), "dock" (the three names) and "open" (dials, reasons, actions).
// Swipe the top edge up or down to move between them; tap it to toggle.
//   tonight: useTonight(); mode/setMode; openId/setOpenId (the pick shown as a card)
//   planOf(pick): the plan standing for the pick's venue, or null
//   factOf(pick): a board fact for a pick decide gave no reason for
//   onGo(pick), onDone(plan), onHeight(px)
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekdayOf = (day) => WEEKDAY_LONG[new Date(`${day}T12:00:00`).getDay()];
const when = (d) => `${WEEKDAY[d.getDay()]} ${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() < 12 ? "am" : "pm"}`;
const UP = { peek: "dock", dock: "open", open: "open" };
const DOWN = { open: "dock", dock: "peek", peek: "peek" };

export default function TonightPanel({ tonight, mode, setMode, openId, setOpenId, planOf, factOf, canEdit, onGo, onDone, onHeight }) {
  const root = useRef(null), drag = useRef(null);
  const [offset, setOffset] = useState(0);
  const { picks } = tonight;
  const today = sessionDate(tonight.now);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new ResizeObserver(() => onHeight?.(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function down(event) {
    if (event.button > 0 || event.target.closest("button:not(.tn-grip),a")) return;
    drag.current = { x: event.clientX, y: event.clientY, t: performance.now() };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event) {
    if (drag.current) setOffset(event.clientY - drag.current.y);
  }
  function up(event) {
    if (!drag.current) return;
    const { x, y, t } = drag.current;
    drag.current = null;
    setOffset(0);
    const dx = event.clientX - x, dy = event.clientY - y;
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) { setMode(mode === "open" ? "dock" : UP[mode]); return; }
    const action = sheetDragAction({ dx, dy, elapsed: performance.now() - t, expanded: mode === "open" });
    if (action === "expand") setMode(UP[mode]);
    else if (action === "collapse" || action === "dismiss") setMode(DOWN[mode]);
  }

  const style = offset ? { transform: `translateY(${Math.max(-40, offset)}px)`, transition: "none" } : undefined;
  return (
    <section ref={root} className={`tn tn-${mode}`} style={style} aria-label="Tonight">
      <header className="tn-head" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <span className="tn-handle" aria-hidden="true" />
        <div className="tn-title-row">
          <button type="button" className="tn-grip" aria-expanded={mode === "open"} onClick={(e) => { if (e.detail === 0) setMode(mode === "open" ? "dock" : UP[mode]); }}>
            <h2 className="tn-title">Tonight</h2>
          </button>
          {mode === "open"
            ? <button type="button" className="tn-more" onClick={tonight.more}><Icon name="shuffle" size={18} /><span>Three more</span></button>
            : <span className="tn-when t-tab">{when(tonight.now)}</span>}
        </div>
      </header>

      {mode === "dock" && (
        <ol className="tn-dock-list">
          {picks.map((pick) => (
            <li key={pick.id}>
              <button type="button" className="tn-dock-row" onClick={() => { setOpenId(pick.id); setMode("open"); }}>
                <Icon name={pickIcon(pick)} size={20} className={pick.save ? "tn-ic-blue" : "tn-ic"} />
                <span className="tn-dock-name">{pick.title}</span>
                <span className="tn-dist t-tab">{pick.distance}</span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {mode === "open" && (
        <div className="tn-body">
          <div className="tn-dials">
            <div className="tn-dial"><span className="t-caps" aria-hidden="true">Who</span>
              <SegmentedControl label="Who" options={COMPANY} value={tonight.company} onChange={tonight.setCompany} /></div>
            <div className="tn-dial"><span className="t-caps" aria-hidden="true">Energy</span>
              <SegmentedControl label="Energy" className="tn-energy" options={ENERGY} value={tonight.energy} onChange={tonight.setEnergy} /></div>
          </div>
          <ol className="tn-list">
            {picks.map((pick) => {
              const open = pick.id === openId, plan = planOf(pick);
              // The pick's day: tonight, or the later date a save is for.
              const day = pickDay(pick, tonight.now), later = day !== today;
              const onDay = !!plan && plan.planDate === day;
              const planLine = plan && (onDay ? (later ? `Planned ${shortDay(day)}` : "On tonight's plan") : plan.planDate ? `Planned ${shortDay(plan.planDate)}` : "Planned");
              const reasons = pick.reasons.length ? pick.reasons : open && factOf(pick) ? [{ text: factOf(pick), tone: "" }] : [];
              return (
                <li key={pick.id} className={`tn-pick${open ? " tn-pick-open" : ""}`}>
                  <button type="button" className="tn-pick-head" aria-expanded={open} onClick={() => setOpenId(open ? null : pick.id)}>
                    <span className={`tn-badge${pick.save ? " tn-badge-blue" : ""}${open ? " tn-badge-on" : ""}`}><Icon name={pickIcon(pick)} size={open ? 24 : 20} /></span>
                    <span className="tn-main">
                      <span className="tn-name">{pick.title}</span>
                      {pick.line && <span className="tn-line">{pick.line}</span>}
                      {!open && reasons[0] && <span className={`tn-reason-lead${reasons[0].tone ? ` tn-${reasons[0].tone}` : ""}`}>{reasons[0].text}</span>}
                    </span>
                    <span className="tn-dist t-tab">{pick.distance}</span>
                  </button>
                  {open && (
                    <div className="tn-card">
                      {(reasons.length > 0 || plan) && (
                        <ul className="tn-reasons">
                          {plan && <li className="tn-blue"><Icon name="check" size={16} />{planLine}</li>}
                          {reasons.map((r) => <li key={r.text} className={r.tone ? `tn-${r.tone}` : ""}><span className="tn-tick" aria-hidden="true" />{r.text}</li>)}
                        </ul>
                      )}
                      <div className="tn-actions">
                        {onDay
                          ? (!later && <Button variant="primary" icon="check" disabled={!canEdit} onClick={() => onDone(plan)}>Done</Button>)
                          : <Button variant="primary" disabled={!canEdit} onClick={() => onGo(pick)}>{later ? `Go ${weekdayOf(day)}` : "Go tonight"}</Button>}
                        {pick.spot
                          ? <Button variant="quiet" icon="directions" href={directions({ ...pick.spot, name: pick.place?.name || pick.event?.venueName || pick.title, address: pick.place?.address || "" })}>Directions</Button>
                          : pick.event?.url ? <Button variant="quiet" icon="link" href={pick.event.url}>Event page</Button>
                          : pick.save?.source?.url ? <Button variant="quiet" icon="link" href={pick.save.source.url}>Open</Button> : null}
                      </div>
                      {pick.spot && pick.event?.url && <a className="tn-source" href={pick.event.url} target="_blank" rel="noreferrer">Event page</a>}
                      <button type="button" className="tn-skip" onClick={() => { tonight.notTonight(pick.id); setOpenId(null); }}>Not tonight</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}

function pickIcon(pick) {
  return pick.place ? kindIcon(pick.place.category) : "clock";
}
