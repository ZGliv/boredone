import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const ToastContext = createContext(() => {});
// const toast = useToast(); toast("Saved", {action: {label: "Undo", run}}).
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [current, setCurrent] = useState(null);
  const timer = useRef(0);
  const toast = useCallback((text, { action = null, ms = 3200 } = {}) => {
    clearTimeout(timer.current);
    setCurrent({ text, action, id: Date.now() });
    timer.current = setTimeout(() => setCurrent(null), action ? ms + 2000 : ms);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-slot" role="status" aria-live="polite">
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
