import React from "react";

// options: [{value, label}]. A radio group drawn as one hairline bar.
export default function SegmentedControl({ options, value, onChange, label, className = "" }) {
  return (
    <div className={`segmented ${className}`} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={option.value === value}
          onClick={() => onChange(option.value)}>{option.label}</button>
      ))}
    </div>
  );
}
