// City board: "complete this city" as derived facts, never stored points.
//
// A board is one named, versioned edition of a city's places. Progress is
// always recomputed from the private journal (visited outings), so deleting a
// memory recomputes honestly. The only things a board carries forward are the
// records an edition upgrade must not lose (see upgradeBoard).
//
// Pure module: no DOM, no clock. Dates come from the journal's visitDate.
import { normalizeKind, venueGroup } from "./venues.js";
import { validDate } from "./model.js";
import { SYNONYMS, nameKey, nameSimilarity } from "./saveMatch.js";

export const ELSEWHERE = "Elsewhere";
export const MATCH_RADIUS_M = 120;
// A name that differs only in wording ("Heinz Hall" / "Heinz Hall for the
// Performing Arts", "Fogo de Chão" / "Fogo de Chao Brazilian Steakhouse")
// is the same venue only when it is this close and this similar.
export const NEAR_MATCH_M = 60;
export const NEAR_SIMILARITY = 0.85;
export const COUNT_MILESTONES = [10, 25, 50, 100, 250];
export const SET_MIN = 4;
export const SET_MAX = 15;
export const TASTE_GOAL = 5;

const GROUP_LABELS = {
  food: "places to eat",
  drinks: "bars",
  coffee: "coffee spots",
  culture: "stages and screens",
  play: "games and creative spots",
};
const KIND_PLURALS = {
  bakery: "bakeries",
  brewery: "breweries",
  winery: "wineries",
  ice_cream: "ice cream shops",
  cafe: "cafes",
  coffee_shop: "coffee shops",
  bar: "bars",
  pub: "pubs",
  theatre: "theaters",
  theater: "theaters",
  cinema: "cinemas",
  nightclub: "nightclubs",
  comedy_club: "comedy clubs",
  music_venue: "music venues",
  restaurant: "restaurants",
  biergarten: "beer gardens",
  miniature_golf: "mini golf courses",
  bowling_alley: "bowling alleys",
  escape_game: "escape rooms",
  amusement_arcade: "arcades",
  horseback_riding: "horseback riding stables",
};
export const kindPlural = (kind) => KIND_PLURALS[kind] || `${kind.replace(/_/g, " ")}s`;

// Letters and digits from any script are kept, so "匹夫小馆" or "Кофейня"
// can match by name in any city; only Latin accents are folded away.
export function normalizeName(name = "") {
  return String(name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim()
    .replace(/^the /, "");
}

// The identity key: normalizeName with spelling variants folded
// (theatre/theater, centre/center, St/Saint), the same words saveMatch folds.
export function venueKey(name = "") {
  return normalizeName(name).split(" ").map((t) => SYNONYMS[t] || t).join(" ");
}

export function slug(value = "") {
  return normalizeName(value).replace(/ /g, "-");
}

export function distanceM(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const hasPoint = (p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng);

// Small deterministic hash (FNV-1a) so a set id changes only when membership does.
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function boardPlace(place) {
  const neighborhood = typeof place.neighborhood === "string" && place.neighborhood.trim() ? place.neighborhood.trim() : ELSEWHERE;
  return { ...place, kind: normalizeKind(place.category), neighborhood };
}

const byName = (a, b) => (a.name === ELSEWHERE) - (b.name === ELSEWHERE) || a.name.localeCompare(b.name);

// A city pack (data/city-packs/*.json) names these fields slug, city and
// release; the Overture release is the edition. Labels use the pack's
// shortName ("Columbus"), not its display name ("Columbus, OH").
export function boardFromPack(pack) {
  return makeBoard({ cityId: pack?.slug, cityName: pack?.shortName || pack?.city, edition: pack?.release, builtAt: pack?.builtAt, places: pack?.places });
}

// A board is one edition of a city. Places without a usable id, name,
// coordinates or venue kind are left out (and counted), never guessed at.
export function makeBoard({ cityId, cityName, edition, builtAt, places }) {
  if (typeof cityId !== "string" || !cityId.trim()) throw new Error("A board needs a city id.");
  if (typeof edition !== "string" || !edition.trim()) throw new Error("A board needs an edition.");
  if (!Array.isArray(places)) throw new Error("A board needs a list of places.");
  const kept = new Map();
  let skipped = 0;
  for (const place of places) {
    if (!place || typeof place.id !== "string" || !place.id || kept.has(place.id) ||
      typeof place.name !== "string" || !place.name.trim() || !hasPoint(place) || !venueGroup(place.category)) {
      skipped++;
      continue;
    }
    kept.set(place.id, boardPlace(place));
  }
  const list = [...kept.values()].sort((a, b) => a.id.localeCompare(b.id));
  const placeIndex = {};
  list.forEach((place, index) => { placeIndex[place.id] = index; });
  return {
    cityId,
    cityName: typeof cityName === "string" && cityName.trim() ? cityName.trim() : cityId,
    edition,
    builtAt: typeof builtAt === "string" ? builtAt : "",
    total: list.length,
    places: list,
    placeIndex,
    neighborhoods: [...new Set(list.map((p) => p.neighborhood))].sort((a, b) => byName({ name: a }, { name: b })),
    kinds: [...new Set(list.map((p) => p.kind))].sort(),
    skipped,
    retired: [],
    honors: [],
    previousEditions: [],
  };
}

// Identity matching. Journal records carry ids from the guide the user saved
// them from; a city pack may use different ids for the same venue. Rules:
//  1. An exact id match always wins.
//  2. Otherwise the same venueKey within 120 m, nearest first.
//  3. Otherwise a similar name (nameSimilarity either way >= 0.85) within
//     60 m, most similar then nearest.
//  4. Each visit credits at most one place, and a place is credited once;
//     its earned date is the earliest visit that matched it.
// Visits without a valid visit date or coordinates (for rules 2-3) never count.
// decide.js uses the same sameVenue(), so the board and the picks agree.
// Similar names must also lead with the same word (allowing a typo), or be the
// same letters once spaces go: "Pittsburgh Steak Company" is not "Southside
// Steaks" although "steak" sits inside both.
function similarNames(a, b) {
  const similarity = Math.max(nameSimilarity(a, b), nameSimilarity(b, a));
  if (similarity < NEAR_SIMILARITY) return 0;
  const ka = nameKey(a), kb = nameKey(b);
  const leads = ka.replace(/ /g, "") === kb.replace(/ /g, "") || nameSimilarity(ka.split(" ")[0], kb.split(" ")[0]) >= NEAR_SIMILARITY;
  return leads ? similarity : 0;
}

export function sameVenue(place, pool) {
  if (!hasPoint(place) || typeof place.name !== "string") return null;
  // The key is built only once a place is near: most calls find nothing within 120 m.
  let key;
  let best = null;
  for (const other of pool) {
    if (!hasPoint(other) || typeof other.name !== "string") continue;
    // About 120 m of latitude; skips the haversine for almost every place.
    if (Math.abs(other.lat - place.lat) > 0.0012) continue;
    const d = distanceM(place, other);
    if (d > MATCH_RADIUS_M) continue;
    let rank;
    key ??= venueKey(place.name);
    if (key && venueKey(other.name) === key) rank = 2;
    else if (d <= NEAR_MATCH_M) {
      rank = similarNames(place.name, other.name);
      if (!rank) continue;
    } else continue;
    if (!best || rank > best.rank || (rank === best.rank && (d < best.d || (d === best.d && other.id < best.place.id)))) best = { place: other, rank, d };
  }
  return best ? { place: best.place, via: best.rank === 2 ? "name" : "similar", distanceM: best.d } : null;
}

export function matchVisits(candidates, outings = []) {
  const ids = new Map(candidates.map((p) => [p.id, p]));
  const visits = outings
    .filter((o) => o && o.status === "visited" && o.place && typeof o.place.id === "string" && validDate(o.visitDate))
    .sort((a, b) => a.visitDate.localeCompare(b.visitDate) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || String(a.id || "").localeCompare(String(b.id || "")));
  const earned = new Map();
  const credit = (place, visit, via) => {
    const prior = earned.get(place.id);
    if (!prior) earned.set(place.id, { placeId: place.id, visitDate: visit.visitDate, outingId: visit.id || "", via });
    else if (visit.visitDate < prior.visitDate) earned.set(place.id, { ...prior, visitDate: visit.visitDate, outingId: visit.id || "" });
  };
  const rest = [];
  for (const visit of visits) {
    const place = ids.get(visit.place.id);
    if (place) credit(place, visit, "id");
    else rest.push(visit);
  }
  const named = candidates.filter((p) => hasPoint(p) && normalizeName(p.name));
  for (const visit of rest) {
    const hit = sameVenue(visit.place, named);
    if (hit) credit(hit.place, visit, hit.via);
  }
  return earned;
}

// Current places and retired places are matched together so one visit can
// never count toward both a current place and a retired one.
function earnedOn(board, outings) {
  const retired = (board.retired || []).map((p) => ({ ...p, retired: true }));
  const earned = matchVisits([...board.places, ...retired], outings);
  const current = new Map();
  const retiredEarned = new Map();
  for (const [id, row] of earned) (board.placeIndex[id] !== undefined ? current : retiredEarned).set(id, row);
  return { current, retired: retiredEarned };
}

const placeOf = (board, id) => board.places[board.placeIndex[id]];
const percent = (done, total) => (total ? Math.floor((done / total) * 100) : 0);

function tally(board, earned, keyOf) {
  const rows = new Map();
  for (const place of board.places) {
    const key = keyOf(place);
    if (!rows.has(key)) rows.set(key, { done: 0, total: 0, dates: [] });
    const row = rows.get(key);
    row.total++;
    const hit = earned.get(place.id);
    if (hit) {
      row.done++;
      row.dates.push(hit.visitDate);
    }
  }
  return rows;
}

function honorFor(board, type, key) {
  return (board.honors || []).find((h) => h.type === type && h.key === key) || null;
}

export function boardProgress(board, outings = []) {
  const { current, retired } = earnedOn(board, outings);
  const hoods = tally(board, current, (p) => p.neighborhood);
  const kinds = tally(board, current, (p) => p.kind);
  const byNeighborhood = [...hoods].map(([name, row]) => {
    const honor = name === ELSEWHERE ? null : honorFor(board, "neighborhood", name);
    const completeNow = name !== ELSEWHERE && row.total > 0 && row.done === row.total;
    return { name, done: row.done, total: row.total, complete: completeNow || !!honor, completedEdition: completeNow ? board.edition : honor?.edition || null };
  }).sort(byName);
  const byKind = [...kinds].map(([kind, row]) => ({ kind, done: row.done, total: row.total })).sort((a, b) => a.kind.localeCompare(b.kind));
  const rows = [...current.values()].map((hit) => ({ ...hit, place: placeOf(board, hit.placeId) }));
  const firsts = [];
  for (const row of [...rows].sort((a, b) => a.visitDate.localeCompare(b.visitDate) || a.placeId.localeCompare(b.placeId))) {
    const hood = row.place.neighborhood;
    if (hood !== ELSEWHERE && !firsts.some((f) => f.neighborhood === hood)) firsts.push({ neighborhood: hood, placeId: row.placeId, name: row.place.name, visitDate: row.visitDate });
  }
  const recent = rows
    .sort((a, b) => b.visitDate.localeCompare(a.visitDate) || a.placeId.localeCompare(b.placeId))
    .slice(0, 5)
    .map((row) => ({ placeId: row.placeId, name: row.place.name, neighborhood: row.place.neighborhood, visitDate: row.visitDate }));
  return {
    cityId: board.cityId,
    edition: board.edition,
    done: current.size,
    total: board.total,
    percent: percent(current.size, board.total),
    retired: retired.size,
    byNeighborhood,
    byKind,
    firsts,
    recent,
  };
}

function makeSet(board, { key, name, rule, goal, members, scope }) {
  const ids = members.map((p) => p.id).sort();
  return {
    id: `${board.cityId}/${key}/${hash(ids.join("|"))}`,
    key,
    name,
    rule,
    goal,
    size: ids.length,
    scope,
    description: rule === "all" ? `Visit all ${ids.length}` : `Visit any ${goal} of ${ids.length}`,
    members: ids,
    places: members
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(({ id, name: placeName, lat, lng, kind, neighborhood }) => ({ id, name: placeName, lat, lng, kind, neighborhood })),
  };
}

// Sets are small, finishable collections built only from what the edition
// actually contains. A set's id is its rule plus a hash of its members, so it
// stays identical across editions while membership is the same and becomes a
// new set (leaving the old completion intact) when membership changes.
export function generateSets(board) {
  const sets = [];
  const hoods = new Map();
  const kinds = new Map();
  for (const place of board.places) {
    if (!kinds.has(place.kind)) kinds.set(place.kind, []);
    kinds.get(place.kind).push(place);
    if (place.neighborhood === ELSEWHERE) continue;
    if (!hoods.has(place.neighborhood)) hoods.set(place.neighborhood, []);
    hoods.get(place.neighborhood).push(place);
  }
  for (const [hood, members] of hoods) {
    const groups = new Map();
    for (const place of members) {
      const group = venueGroup(place.kind);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(place);
    }
    for (const [group, list] of groups) {
      if (list.length < SET_MIN || list.length > SET_MAX) continue;
      sets.push(makeSet(board, { key: `hood-${group}:${slug(hood)}`, name: `${hood} ${GROUP_LABELS[group]}`, rule: "all", goal: list.length, members: list, scope: { neighborhood: hood, group } }));
    }
    if (members.length > TASTE_GOAL) {
      sets.push(makeSet(board, { key: `taste:${slug(hood)}`, name: `Taste of ${hood}`, rule: "any", goal: TASTE_GOAL, members, scope: { neighborhood: hood } }));
    }
  }
  for (const [kind, list] of kinds) {
    if (list.length < SET_MIN || list.length > SET_MAX) continue;
    sets.push(makeSet(board, { key: `city-${kind}`, name: `${board.cityName} ${kindPlural(kind)}`, rule: "all", goal: list.length, members: list, scope: { kind } }));
  }
  return sets.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

function progressFromEarned(set, earned) {
  const dates = set.members.map((id) => earned.get(id)?.visitDate).filter(Boolean).sort();
  const done = dates.length;
  const complete = done >= set.goal;
  return {
    id: set.id,
    name: set.name,
    done,
    goal: set.goal,
    remaining: Math.max(0, set.goal - done),
    complete,
    completedOn: complete ? dates[set.goal - 1] : null,
    doneIds: set.members.filter((id) => earned.has(id)),
  };
}

// With a board, matching is done against the whole edition so a set agrees
// exactly with boardProgress; without one, against the set's own places.
export function setProgress(set, outings = [], board = null) {
  const earned = board ? earnedOn(board, outings).current : matchVisits(set.places, outings);
  return progressFromEarned(set, earned);
}

// Milestones are facts derived from the journal, each dated by the visit
// that earned it. Nothing here is stored or awarded as points.
export function milestones(board, outings = []) {
  const { current, retired } = earnedOn(board, outings);
  const out = new Map();
  const add = (row) => {
    const prior = out.get(row.id);
    if (!prior || row.date < prior.date) out.set(row.id, row);
  };
  const hoods = tally(board, current, (p) => p.neighborhood);
  for (const [name, row] of hoods) {
    if (name === ELSEWHERE || !row.done) continue;
    const dates = row.dates.sort();
    add({ id: `first:${slug(name)}`, type: "first-in-neighborhood", label: `First place in ${name}`, date: dates[0], edition: board.edition });
    if (row.done === row.total) add({ id: `neighborhood:${slug(name)}`, type: "neighborhood-complete", label: `Finished ${name}`, date: dates[dates.length - 1], edition: board.edition });
  }
  // A kind with a single place is not much of a collection; it needs two.
  const kinds = tally(board, current, (p) => p.kind);
  for (const [kind, row] of kinds) {
    if (row.total < 2 || row.done !== row.total) continue;
    add({ id: `kind:${kind}`, type: "kind-complete", label: `Every one of ${board.cityName}'s ${kindPlural(kind)}`, date: row.dates.sort()[row.dates.length - 1], edition: board.edition });
  }
  // Count milestones are lifetime places on this city's board, so a place
  // that closed after you went still counts.
  const allDates = [...current.values(), ...retired.values()].map((r) => r.visitDate).sort();
  for (const n of COUNT_MILESTONES) {
    if (allDates.length >= n) add({ id: `count:${n}`, type: "places", label: `${n} places in ${board.cityName}`, date: allDates[n - 1], edition: board.edition });
  }
  for (const set of generateSets(board)) {
    const p = progressFromEarned(set, current);
    if (p.complete) add({ id: `set:${set.id}`, type: "set-complete", label: `Completed ${set.name}`, date: p.completedOn, edition: board.edition });
  }
  for (const honor of board.honors || []) {
    const id = honor.type === "set" ? `set:${honor.key}` : honor.type === "kind" ? `kind:${honor.key}` : honor.type === "first" ? `first:${slug(honor.key)}` : `neighborhood:${slug(honor.key)}`;
    const type = honor.type === "set" ? "set-complete" : honor.type === "kind" ? "kind-complete" : honor.type === "first" ? "first-in-neighborhood" : "neighborhood-complete";
    add({ id, type, label: honor.label, date: honor.earnedOn, edition: honor.edition });
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

// Edition upgrades: what you earned stays earned.
//
// In plain English: a new edition replaces the list of places, but it never
// takes anything away from you.
//  - If you went to a place and it is not in the new edition (it closed, or
//    the new data dropped it), it moves to the board's "retired" list. It no
//    longer counts toward the new edition's total, but it still shows as a
//    place you did, and still counts toward lifetime milestones like
//    "25 places". It only drops off if you delete the memory itself.
//  - If you finished a neighborhood, a kind or a set under the old edition,
//    that completion is written down as an honor with the date and edition it
//    was earned in. A new edition adding places to that neighborhood shows the
//    new remaining count, but the area stays marked as completed.
//  - Your first place in a neighborhood is kept the same way, so it survives
//    that place closing or moving to another neighborhood.
//  - Completions are judged against the edition in force. If the only place
//    you had not done in a neighborhood closes, the new edition shows that
//    neighborhood as finished, dated by your last visit there.
//  - Honors written down at an upgrade stay even if you later delete the
//    memories behind them; current progress and retired places recompute.
//  - Nothing here deletes or edits journal records.
export function upgradeBoard(oldBoard, newBoard, outings = []) {
  if (oldBoard.cityId !== newBoard.cityId) throw new Error("Cannot upgrade a board to a different city.");
  const { current: oldEarned, retired: oldRetiredEarned } = earnedOn(oldBoard, outings);
  const newNames = new Map();
  for (const place of newBoard.places) {
    const key = normalizeName(place.name);
    if (!key) continue;
    if (!newNames.has(key)) newNames.set(key, []);
    newNames.get(key).push(place);
  }
  const outingById = new Map(outings.filter((o) => o && o.id).map((o) => [o.id, o]));
  // A place you earned is still listed only if the visit that earned it would
  // still be credited on the new edition; otherwise it retires, so a city pack
  // that shifts coordinates can never quietly erase a visit.
  const stillListed = (place, hit) => {
    if (newBoard.placeIndex[place.id] !== undefined) return true;
    const outing = hit && outingById.get(hit.outingId);
    if (outing) return matchVisits(newBoard.places, [outing]).size > 0;
    const key = normalizeName(place.name);
    return !!key && (newNames.get(key) || []).some((p) => distanceM(p, place) <= MATCH_RADIUS_M);
  };

  const retired = new Map();
  for (const place of oldBoard.retired || []) if (!stillListed(place, oldRetiredEarned.get(place.id))) retired.set(place.id, place);
  for (const [id, hit] of oldEarned) {
    const place = placeOf(oldBoard, id);
    if (stillListed(place, hit) || retired.has(id)) continue;
    const { id: pid, name, lat, lng, category, kind, neighborhood, address, website, source, sourceUrl } = place;
    retired.set(id, { id: pid, name, lat, lng, category, kind, neighborhood, address, website, source, sourceUrl, retiredFrom: oldBoard.edition, visitDate: hit.visitDate });
  }

  const honors = new Map((oldBoard.honors || []).map((h) => [`${h.type}:${h.key}`, h]));
  const keep = (honor) => {
    const id = `${honor.type}:${honor.key}`;
    if (!honors.has(id)) honors.set(id, honor);
  };
  const hoods = tally(oldBoard, oldEarned, (p) => p.neighborhood);
  for (const [name, row] of hoods) {
    if (name !== ELSEWHERE && row.done) keep({ type: "first", key: name, label: `First place in ${name}`, earnedOn: row.dates.sort()[0], edition: oldBoard.edition });
    if (name !== ELSEWHERE && row.total && row.done === row.total) keep({ type: "neighborhood", key: name, label: `Finished ${name}`, earnedOn: row.dates.sort()[row.dates.length - 1], edition: oldBoard.edition });
  }
  const kinds = tally(oldBoard, oldEarned, (p) => p.kind);
  for (const [kind, row] of kinds) {
    if (row.total >= 2 && row.done === row.total) keep({ type: "kind", key: kind, label: `Every one of ${oldBoard.cityName}'s ${kindPlural(kind)}`, earnedOn: row.dates.sort()[row.dates.length - 1], edition: oldBoard.edition });
  }
  for (const set of generateSets(oldBoard)) {
    const p = progressFromEarned(set, oldEarned);
    if (p.complete) keep({ type: "set", key: set.id, name: set.name, label: `Completed ${set.name}`, earnedOn: p.completedOn, edition: oldBoard.edition });
  }

  return {
    ...newBoard,
    retired: [...retired.values()].sort((a, b) => a.id.localeCompare(b.id)),
    honors: [...honors.values()].sort((a, b) => a.earnedOn.localeCompare(b.earnedOn) || `${a.type}:${a.key}`.localeCompare(`${b.type}:${b.key}`)),
    previousEditions: [...new Set([...(oldBoard.previousEditions || []), oldBoard.edition])],
  };
}

// Suggestions that make progress feel reachable. Groups the user has already
// started come first, then the group closest to done, then the nearest place.
// Meant as a gentle tiebreaker for tonight's picks, never an override.
export function nextUp(board, outings = [], { location = null, limit = 3 } = {}) {
  const { current } = earnedOn(board, outings);
  const groups = [];
  const hoods = new Map();
  for (const place of board.places) {
    if (place.neighborhood === ELSEWHERE) continue;
    if (!hoods.has(place.neighborhood)) hoods.set(place.neighborhood, []);
    hoods.get(place.neighborhood).push(place.id);
  }
  for (const [name, ids] of hoods) {
    const done = ids.filter((id) => current.has(id)).length;
    const remaining = ids.length - done;
    if (!remaining) continue;
    groups.push({ id: `neighborhood:${slug(name)}`, name, ids, done, remaining, reason: done ? `${remaining} left to finish ${name}` : `Would be your first place in ${name}` });
  }
  for (const set of generateSets(board)) {
    const p = progressFromEarned(set, current);
    if (p.complete) continue;
    const reason = set.rule === "all" ? `${p.remaining} left to finish ${set.name}` : `${p.remaining} left for ${set.name}`;
    groups.push({ id: `set:${set.id}`, name: set.name, ids: set.members, done: p.done, remaining: p.remaining, reason });
  }
  const point = hasPoint(location) ? location : null;
  const best = new Map();
  for (const group of groups) {
    for (const id of group.ids) {
      if (current.has(id)) continue;
      const place = placeOf(board, id);
      const distanceKm = point ? Math.round(distanceM(point, place) / 100) / 10 : null;
      const row = { place, reason: group.reason, groupId: group.id, remaining: group.remaining, started: group.done > 0, distanceKm };
      const prior = best.get(id);
      if (!prior || rank(row, prior) < 0) best.set(id, row);
    }
  }
  return [...best.values()].sort(rank).slice(0, Math.max(0, limit));
}

function rank(a, b) {
  return (b.started - a.started) ||
    (a.remaining - b.remaining) ||
    ((a.distanceKm ?? 0) - (b.distanceKm ?? 0)) ||
    a.groupId.localeCompare(b.groupId) ||
    a.place.name.localeCompare(b.place.name) ||
    a.place.id.localeCompare(b.place.id);
}
