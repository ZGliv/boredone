import React from "react";
import { Icon } from "../ui";
import { TABS } from "./routes";

// Bottom tabs on a phone, a left rail on a wide screen.
export default function TabBar({ page, navigate }) {
  const active = page === "settings" ? "journal" : page;
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map(([id, label, icon]) => (
        <a key={id} href={`#${id}`} className={`tab tab-${id}`} aria-current={active === id ? "page" : undefined}
          onClick={(event) => { event.preventDefault(); navigate(id); }}>
          <Icon name={icon} size={24} />
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}
