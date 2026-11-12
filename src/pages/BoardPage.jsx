// BoardPage — owner: builder C (with JournalPage, SettingsPage and src/done/).
//
// Contract: takes no props; reads everything from useApp() (src/app/AppContext.js):
//   board, progress (cityBoard.boardProgress), places, states, outings, city,
//   cities, cityId, setCityId, cityStatus, retryCity.
// The total is board.total, the same set the Map draws. Sets, milestones and
// nextUp come from src/cityBoard.js. No XP, streaks or leaderboards.
// Done ids come from `states`, which matches visits exactly as the board does.
import React, { useMemo, useState } from "react";
import { useApp } from "../app/AppContext";
import CitySwitcher from "../city/CitySwitcher";
import { count } from "../city/placeText";
import { ELSEWHERE, kindPlural, milestones, nextUp } from "../cityBoard";
import { Icon, ProgressDots, Ring, kindIcon } from "../ui";
import BoardGrid from "../done/BoardGrid";
import PlaceListSheet from "../done/PlaceListSheet";
import { almostFinished, boardSets, doneIdsFrom, factDate, gridCells, leftText } from "../done/boardView";
import { targetHash } from "../app/routes";
import "./BoardPage.css";

const cap = (text) => text[0].toUpperCase() + text.slice(1);

export default function BoardPage() {
  const { board, progress, places, states, outings, cities, cityId, setCityId, cityStatus, retryCity, navigate } = useApp();
  const openOnMap = (place) => navigate(targetHash("map", place.id));
  const [open, setOpen] = useState(null);
  const [allHoods, setAllHoods] = useState(false);
  const doneIds = useMemo(() => doneIdsFrom(states), [states]);
  const cells = useMemo(() => gridCells(board, states), [board, states]);
  const sets = useMemo(() => boardSets(board), [board]);
  const close = useMemo(() => almostFinished(sets, doneIds, 4), [sets, doneIds]);
  const facts = useMemo(() => (board ? milestones(board, outings).slice().reverse() : []), [board, outings]);
  const next = useMemo(() => {
    if (!board || !doneIds.size) return null;
    const [row] = nextUp(board, outings, { limit: 1 });
    return row?.started ? row : null;
  }, [board, outings, doneIds]);
  // The set "Next" already names is not listed again under it.
  const shown = close.filter((set) => !next || next.groupId !== `set:${set.id}`);
  const hoods = useMemo(() => (progress ? progress.byNeighborhood.filter((row) => row.name !== ELSEWHERE)
    .sort((a, b) => b.done - a.done || b.total - a.total || a.name.localeCompare(b.name)) : []), [progress]);
  const kinds = useMemo(() => (progress ? progress.byKind.filter((row) => row.total > 0)
    .sort((a, b) => b.done - a.done || b.total - a.total || a.kind.localeCompare(b.kind)) : []), [progress]);

  function show(kind, key) {
    if (kind === "set") {
      const set = sets.find((s) => s.id === key);
      const standing = close.find((s) => s.id === key);
      setOpen({ title: set.name, places: set.places.map((p) => board.places[board.placeIndex[p.id]]), count: `${standing?.done ?? 0} of ${set.goal}` });
    } else {
      const row = (kind === "hood" ? hoods : kinds).find((r) => (r.name || r.kind) === key);
      const match = kind === "hood" ? (p) => p.neighborhood === key : (p) => p.kind === key;
      setOpen({ title: kind === "hood" ? key : cap(kindPlural(key)), places: places.filter(match), count: `${row.done} of ${row.total}` });
    }
  }

  return (
    <div className="board">
      <CitySwitcher cities={cities} cityId={cityId} onChange={setCityId} />
      {cityStatus === "loading" && !progress && <p className="page-status" role="status">Loading places</p>}
      {cityStatus === "error" && <p className="page-status" role="alert">Places didn't load<button type="button" onClick={retryCity}>Retry</button></p>}
      {progress && (
        <>
          <h1 className="board-total">
            <span className="board-done t-num">{count(progress.done)}</span>
            <span className="board-of t-tab">of {count(progress.total)} done</span>
          </h1>
          <BoardGrid cells={cells} label={`${count(progress.done)} of ${count(progress.total)} done`} />
          <p className="board-key" aria-hidden="true">
            <i className="key-done" />Done<i className="key-pile" />On your pile<i className="key-rest" />Not yet
          </p>

          {next && (
            <button type="button" className="board-next" onClick={() => openOnMap(next.place)}>
              <span className="t-caps">Next</span>
              <span className="board-next-name">{next.place.name}</span>
              <span className="board-next-why">{next.reason}</span>
              <Icon name="forward" size={20} className="board-next-go" />
            </button>
          )}

          {shown.length > 0 && (
            <section>
              <h2 className="t-caps section-label">Almost finished</h2>
              <ul className="board-sets">
                {shown.map((set) => (
                  <li key={set.id}>
                    <button type="button" onClick={() => show("set", set.id)}>
                      <span className="board-set-name">{set.name}</span>
                      <span className="board-set-line">
                        <ProgressDots done={set.done} total={set.goal} />
                        {set.goal > 15 && <span className="t-tab board-set-frac">{set.done} of {set.goal}</span>}
                        <span className="board-set-left">{leftText(set)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="t-caps section-label">Neighborhoods <span className="t-tab">{hoods.length}</span></h2>
            <ul className="board-hoods">
              {(allHoods ? hoods : hoods.slice(0, Math.max(8, hoods.filter((r) => r.done).length))).map((row) => (
                <li key={row.name}>
                  <button type="button" onClick={() => show("hood", row.name)}>
                    <Ring done={row.done} total={row.total} />
                    <span className="board-hood-name">{row.name}</span>
                    <span className={`board-hood-count t-tab${row.done ? " is-started" : ""}`}>{row.done} of {row.total}</span>
                  </button>
                </li>
              ))}
            </ul>
            {!allHoods && hoods.length > Math.max(8, hoods.filter((r) => r.done).length) && (
              <button type="button" className="board-more" onClick={() => setAllHoods(true)}>All {hoods.length}<Icon name="down" size={18} /></button>
            )}
          </section>

          <section>
            <h2 className="t-caps section-label">Kinds</h2>
            <ul className="board-kinds">
              {kinds.map((row) => (
                <li key={row.kind}>
                  <button type="button" onClick={() => show("kind", row.kind)}>
                    <Icon name={kindIcon(row.kind)} size={20} className={row.done ? "is-started" : ""} />
                    <span className="board-kind-name">{cap(kindPlural(row.kind))}</span>
                    <span className="board-kind-bar" aria-hidden="true"><i style={{ width: `${(row.done / row.total) * 100}%` }} /></span>
                    <span className="board-kind-count t-tab">{row.done}<span> of {count(row.total)}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {facts.length > 0 && (
            <section>
              <h2 className="t-caps section-label">Milestones</h2>
              <ol className="board-facts">
                {facts.map((fact) => (
                  <li key={fact.id}><time className="t-tab" dateTime={fact.date}>{factDate(fact.date)}</time><span>{fact.label}</span></li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
      {open && <PlaceListSheet {...open} states={states} onClose={() => setOpen(null)} onOpen={(place) => { setOpen(null); openOnMap(place); }} />}
    </div>
  );
}
