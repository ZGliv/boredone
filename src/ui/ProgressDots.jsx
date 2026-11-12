import React from "react";

// Small finishable sets as dots: gold done, hollow left. Past `max` dots the
// set is too big to read as dots, so it shows nothing; say "12 of 40" instead.
export default function ProgressDots({ done, total, max = 15, className = "" }) {
  if (!total || total > max) return null;
  return (
    <span className={`dots ${className}`} role="img" aria-label={`${done} of ${total}`}>
      {Array.from({ length: total }, (_, i) => <span key={i} className={i < done ? "dot dot-done" : "dot"} />)}
    </span>
  );
}
