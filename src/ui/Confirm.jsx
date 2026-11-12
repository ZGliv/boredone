import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import Button from "./Button.jsx";
import Sheet from "./Sheet.jsx";

const ConfirmContext = createContext(async () => false);
// const confirm = useConfirm(); if (await confirm("Delete Howlers?", {action: "Delete"})) ...
// Resolves true only when the action is pressed; dismissing is "no".
export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }) {
  const [ask, setAsk] = useState(null);
  const answer = useRef(false);
  const confirm = useCallback((title, { action = "Delete" } = {}) => new Promise((resolve) => {
    answer.current = false;
    setAsk({ title, action, resolve });
  }), []);
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {ask && (
        <Sheet title={ask.title} className="confirm-sheet" onClose={() => { ask.resolve(answer.current); setAsk(null); }}>
          {(close) => (
            <div className="confirm-actions">
              <Button variant="quiet" onClick={close}>Keep</Button>
              <Button variant="quiet" className="btn-danger" onClick={() => { answer.current = true; close(); }}>{ask.action}</Button>
            </div>
          )}
        </Sheet>
      )}
    </ConfirmContext.Provider>
  );
}

