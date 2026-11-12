// BoardPage — owner: builder C (with JournalPage, SettingsPage and src/done/).
//
// Contract: takes no props; reads everything from useApp() (src/app/AppContext.js):
//   board, progress (cityBoard.boardProgress), places, states, outings, city,
//   cities, cityId, setCityId, cityStatus, retryCity.
// The total is board.total, the same set the Map draws. Sets, milestones and
// nextUp come from src/cityBoard.js. No XP, streaks or leaderboards.
import React from "react";
import { useApp } from "../app/AppContext";
import CitySwitcher from "../city/CitySwitcher";
import { count } from "../city/placeText";
import { ELSEWHERE } from "../cityBoard";
import { Ring } from "../ui";
import "./BoardPage.css";

export default function BoardPage() {
  const { progress, cities, cityId, setCityId, cityStatus, retryCity } = useApp();
  const hoods = progress ? progress.byNeighborhood.filter((row) => row.name !== ELSEWHERE)
    .sort((a, b) => b.done - a.done || b.total - a.total || a.name.localeCompare(b.name)) : [];
  return (
    <>
      <CitySwitcher cities={cities} cityId={cityId} onChange={setCityId} />
      {cityStatus === "loading" && <p className="page-status" role="status">Loading places</p>}
      {cityStatus === "error" && <p className="page-status" role="alert">Places didn't load<button type="button" onClick={retryCity}>Retry</button></p>}
      {progress && (
        <>
          <h1 className="board-total">
            <span className="board-done t-num">{count(progress.done)}</span>
            <span className="board-of">of {count(progress.total)} done</span>
          </h1>
          <h2 className="t-caps section-label">Neighbourhoods</h2>
          <ul className="board-hoods">
            {hoods.map((row) => (
              <li key={row.name}>
                <Ring done={row.done} total={row.total} />
                <span className="board-hood-name">{row.name}</span>
                <span className="board-hood-count t-tab">{row.done} of {row.total}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
