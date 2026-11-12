import React from "react";
import { ICONS } from "./icons.js";

// <Icon name="map"/>. Decorative by default; pass `label` when the icon is
// the only thing that says what a control does.
export default function Icon({ name, size = 24, label, className = "", ...rest }) {
  const d = ICONS[name];
  if (!d) throw new Error(`No icon named "${name}".`);
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" role={label ? "img" : undefined}
      aria-label={label} aria-hidden={label ? undefined : true} focusable="false" {...rest}>
      <path d={d} />
    </svg>
  );
}
