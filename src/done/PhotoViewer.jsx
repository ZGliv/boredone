import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "../ui";

// One photo, full screen. Arrows and Escape work; swipe left/right moves.
export default function PhotoViewer({ photos, index, name, onIndex, onClose }) {
  const ref = useRef(null), start = useRef(null);
  useEffect(() => {
    const opener = document.activeElement;
    ref.current.focus();
    const key = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex((i) => Math.min(photos.length - 1, i + 1));
      if (e.key === "ArrowLeft") onIndex((i) => Math.max(0, i - 1));
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); opener?.focus?.({ preventScroll: true }); };
  }, []);
  return createPortal(
    <div ref={ref} className="viewer" role="dialog" aria-modal="true" aria-label={name} tabIndex={-1}
      onPointerDown={(e) => { start.current = e.clientX; }}
      onPointerUp={(e) => {
        const dx = e.clientX - (start.current ?? e.clientX);
        if (dx < -48) onIndex((i) => Math.min(photos.length - 1, i + 1));
        if (dx > 48) onIndex((i) => Math.max(0, i - 1));
        start.current = null;
      }}>
      <div className="viewer-top">
        <span className="t-tab">{index + 1} / {photos.length}</span>
        <Button variant="text" icon="close" aria-label="Close" onClick={onClose} />
      </div>
      <img src={photos[index]} alt={`Photo ${index + 1} from ${name}`} draggable={false} />
      {photos.length > 1 && (
        <div className="viewer-nav">
          <Button variant="text" icon="back" aria-label="Previous photo" disabled={index === 0} onClick={() => onIndex(index - 1)} />
          <Button variant="text" icon="forward" aria-label="Next photo" disabled={index === photos.length - 1} onClick={() => onIndex(index + 1)} />
        </div>
      )}
    </div>,
    document.body,
  );
}
