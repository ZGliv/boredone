import React from "react";

// Progress ring. value is done / total; a hairline track with a gold arc.
export default function Ring({ done, total, size = 22, stroke = 2.4, className = "" }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const share = total ? Math.min(1, done / total) : 0;
  return (
    <svg className={`ring ${className}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${done} of ${total}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
      {share > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--gold)" strokeWidth={stroke}
        strokeDasharray={`${c * share} ${c}`} strokeLinecap={share < 1 ? "round" : "butt"} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
    </svg>
  );
}
