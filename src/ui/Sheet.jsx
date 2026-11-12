import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { sheetDragAction } from "../sheetGesture.js";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
// Open sheets, oldest first. Escape and Tab belong to the top one only, so a
// confirm over a sheet closes alone.
const open = [];

// Bottom sheet. Dismisses by swiping down on its top edge, Escape, the scrim,
// or a close button that only appears for keyboard focus.
// modal (default): scrim, focus trapped, focus returns to the opener on close.
// modal={false}: the page behind stays usable (map sheets).
// Render it only while open: {place && <Sheet onClose={...}>}.
// children may be a function of close, for buttons that end the sheet.
// Mark the field to focus on open with data-autofocus (not autoFocus: React
// focuses that before the sheet can see who opened it).
export default function Sheet({ title, label, onClose, modal = true, className = "", headerExtra, children }) {
  const sheet = useRef(null), drag = useRef(null);
  // Read during the first render, before any child takes focus.
  const [opener] = useState(() => (typeof document === "undefined" ? null : document.activeElement));
  const [offset, setOffset] = useState(0), [leaving, setLeaving] = useState(false);
  const titleId = useId();
  const close = () => setLeaving(true);

  useLayoutEffect(() => {
    if (modal) (sheet.current.querySelector("[data-autofocus]") || sheet.current).focus({ preventScroll: true });
    return () => { if (modal && opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, [modal]);
  useEffect(() => {
    const self = sheet.current;
    open.push(self);
    const key = (event) => {
      if (open.at(-1) !== self) return;
      if (event.key === "Escape") { event.stopPropagation(); close(); }
      if (modal && event.key === "Tab") {
        const items = [...sheet.current.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      open.splice(open.indexOf(self), 1);
    };
  }, [modal]);
  useEffect(() => {
    if (!leaving) return;
    const done = setTimeout(onClose, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200);
    return () => clearTimeout(done);
  }, [leaving]);

  function down(event) {
    if (event.button > 0 || event.target.closest("button,a,input,select,textarea")) return;
    drag.current = { x: event.clientX, y: event.clientY, t: performance.now() };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event) {
    if (!drag.current) return;
    setOffset(Math.max(0, event.clientY - drag.current.y));
  }
  function up(event) {
    if (!drag.current) return;
    const { x, y, t } = drag.current;
    drag.current = null;
    const action = sheetDragAction({ dx: event.clientX - x, dy: event.clientY - y, elapsed: performance.now() - t });
    if (action === "dismiss") close();
    else setOffset(0);
  }

  const style = leaving ? undefined : offset ? { transform: `translateY(${offset}px)`, transition: "none" } : undefined;
  return createPortal(
    <div className={`sheet-layer${modal ? " sheet-modal" : ""}${leaving ? " sheet-leaving" : ""}`}>
      {modal && <div className="sheet-scrim" onClick={close} />}
      <section ref={sheet} className={`sheet ${className}`} role={modal ? "dialog" : "region"} aria-modal={modal || undefined}
        aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : label} tabIndex={-1} style={style}>
        <header className="sheet-head" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <span className="sheet-handle" aria-hidden="true" />
          {(title || headerExtra) && <div className="sheet-title-row">{title && <h2 id={titleId} className="sheet-title">{title}</h2>}{headerExtra}</div>}
        </header>
        <div className="sheet-body">{typeof children === "function" ? children(close) : children}</div>
        <button type="button" className="sheet-close" onClick={close}>Close</button>
      </section>
    </div>,
    document.body,
  );
}
