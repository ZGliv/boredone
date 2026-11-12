import React from "react";
import { directions } from "../app/routes";
import { searchOutings } from "../app/outings";

// "Do it": saved plans, searchable, each ready to be marked as visited.
export default function PlansPage({ plans, query, setQuery, canEdit, navigate, actions, setEditor }) {
  const filtered = searchOutings(plans, query);
  return (
          <>
            <section className="collection-intro">
              <div><h1>Your plans</h1><p>Next up, whenever you’re ready.</p></div>
              <button onClick={() => actions.manual(false)} disabled={!canEdit}>+ Add a plan</button>
            </section>
            <div className="section-header">
              <h2>
                {`${plans.length} saved ${plans.length === 1 ? "plan" : "plans"}`}
              </h2>
              <label className="collection-search">
                <span className="sr-only">Search your plans</span>
                <input
                  placeholder="Search your plans…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            </div>
            {!filtered.length ? (
              <div className="empty-state">
                <h3>
                  {query
                    ? "Nothing matches that search."
                    : "Your next plan belongs here."}
                </h3>
                <p>
                  {query
                    ? "Try a place, person or word from your notes."
                    : "Save a place from Find it, or add something you already have in mind."}
                </p>
                {!query && (
                  <button
                    className="secondary"
                    onClick={() => navigate("find")}
                    disabled={!canEdit}
                  >
                    Find something to do
                  </button>
                )}
              </div>
            ) : (
              <div className="plans-list">
                {filtered.map((outing) =>
                    <article className="plan-card" key={outing.id}>
                      <div className="plan-date">
                        <strong>
                          {outing.planDate
                            ? new Date(
                                outing.planDate + "T12:00:00",
                              ).toLocaleDateString(undefined, {
                                day: "2-digit",
                              })
                            : "Soon"}
                        </strong>
                        <span>
                          {outing.planDate
                            ? new Date(
                                outing.planDate + "T12:00:00",
                              ).toLocaleDateString(undefined, {
                                month: "short",
                                year: "numeric",
                              })
                            : "No rush"}
                        </span>
                      </div>
                      <div className="plan-info">
                        <span className="kicker">
                          {outing.place.category || "Your idea"}
                        </span>
                        <h3>{outing.place.name}</h3>
                        {outing.with && <p>With {outing.with}</p>}
                        {outing.notes && (
                          <p className="preserve-lines">{outing.notes}</p>
                        )}
                        <details className="plan-options"><summary>Details & edit</summary><div className="plan-links">
                          {outing.place.source !== "Sample" && <a
                            href={directions(outing.place)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open map ↗
                          </a>}
                          {outing.place.website && (
                            <a
                              href={outing.place.website}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Venue website ↗
                            </a>
                          )}
                          {outing.place.sourceUrl && (
                            <a
                              href={outing.place.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Source listing ↗
                            </a>
                          )}
                          <button
                            className="text-button"
                            disabled={!canEdit}
                            onClick={() => setEditor({ outing, isNew: false })}
                          >
                            Edit plan
                          </button>
                          <button
                            className="text-button quiet"
                            disabled={!canEdit}
                            onClick={() => actions.remove(outing)}
                          >
                            Remove
                          </button>
                        </div>
                      </details></div>
                      <button disabled={!canEdit} onClick={() => actions.visit(outing)}>I went ↗</button>
                    </article>
                )}
              </div>
            )}
          </>
  );
}
