import React from "react";
import { TABS } from "./routes";

export default function AppHeader({ page, plans, memories, drafts, theme, toggleTheme, navigate }) {
  return (
      <header className={`app-header ${page==="find"?"explore-header":""}`}>
        <a className="brand" href="#find" onClick={() => navigate("find")}>
          boredone
        </a>
        <nav aria-label="Main navigation" hidden={page==="find"}>
          {TABS.map(([id, label]) => (
            <button
              key={id}
              className="nav-button"
              aria-current={page === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              {label}
              {id === "plans" && plans.length > 0 && (
                <span>{plans.length}</span>
              )}
              {id === "memories" && memories.length > 0 && (
                <span>{memories.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="header-actions">
        <button className="theme-toggle" onClick={toggleTheme} aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'} title={theme==='dark'?'Light mode':'Dark mode'}><img src={`/world/icons/${theme==='dark'?'sun':'moon'}.svg`} alt=""/></button>
        <button
          className={`journal-button ${page === "settings" ? "active" : ""}`}
          onClick={() => navigate(page==="find"?"plans":"settings")}
          aria-label={page==="find"?"Saved outings":"Journal settings and backup"}
        >
          {page==="find"?<><img src="/world/icons/bookmark-simple.svg" alt=""/> {drafts.length?`Saved · ${drafts.length}`:"Saved"}</>:<>Your journal <span>↗</span></>}
        </button>
        </div>
      </header>
  );
}
