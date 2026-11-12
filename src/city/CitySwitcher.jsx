import React, { useState } from "react";
import { Icon, Row, Sheet } from "../ui";

// "Pittsburgh ⌄". Lists the city packs that exist; picking one switches the
// Map, Board and picks together.
export default function CitySwitcher({ cities, cityId, onChange, onOpen, className = "" }) {
  const [open, setOpen] = useState(false);
  const current = cities.find((city) => city.id === cityId);
  return (
    <>
      <button type="button" className={`city-switcher ${className}`} aria-haspopup="dialog" onClick={() => { setOpen(true); onOpen?.(); }}>
        <span>{current?.name}</span><Icon name="down" size={18} />
      </button>
      {open && (
        <Sheet title="City" onClose={() => setOpen(false)}>
          {cities.map((city) => (
            <Row key={city.id} title={city.name} aria-current={city.id === cityId || undefined}
              trail={city.id === cityId ? <Icon name="check" size={20} className="city-current" label="Current city" /> : null}
              onClick={() => { onChange(city.id); setOpen(false); }} />
          ))}
        </Sheet>
      )}
    </>
  );
}
