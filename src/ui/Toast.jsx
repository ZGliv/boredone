import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const ToastContext = createContext(() => {});
// const toast = useToast(); toast("Saved", {action: {label: "Undo", run}}).
// toast(null) clears the current one.
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [current, setCurrent] = useState(null);
  const timer = useRef(0);
  const toast = useCallback((text, { action = null, ms = 3200 } = {}) => {
    clearTimeout(timer.current);
    if (text == null) { setCurrent(null); return; }
    setCurrent({ text, action, id: Date.now() });
    timer.current = setTimeout(() => setCurrent(null), action ? ms + 2000 : ms);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  // The toast sits just above the tab bar. While it shows, it rides above the
  // top sheet's edge so it never covers a sheet's buttons; a sheet taller
  // than 60% of the screen keeps it in place rather than push it up to the
  // page title.
  const slot = useRef(null);
  useEffect(() => {
    if (!current) return;
    let frame = 0;
    const place = () => {
      const el = slot.current;
      if (el) {
        const sheet = [...document.querySelectorAll(".sheet")].at(-1);
        const top = sheet ? sheet.getBoundingClientRect().top : Infinity;
        el.style.transform = "";
        const over = el.getBoundingClientRect().bottom - top;
        if (over > 0 && top > window.innerHeight * 0.4) el.style.transform = `translateY(${-(over + 12)}px)`;
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [current]);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div ref={slot} className="toast-slot" role="status" aria-live="polite">
        {current && (
          <div className="toast" key={current.id}>
            <span>{current.text}</span>
            {current.action && <button type="button" onClick={() => { current.action.run(); setCurrent(null); }}>{current.action.label}</button>}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
