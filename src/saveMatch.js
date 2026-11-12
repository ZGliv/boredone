// Pure matching of resolver candidates ({name, kind, venue, ...}) against
// known places. A match is a claim to the user ("Is this the place?"), so a
// weak one is dropped rather than guessed, and a chain with several branches
// returns every branch instead of picking one.
import {normalizeKind, venueGroup} from './venues.js';

// Words that describe the kind of venue, not which one. "Mike's Beer Bar" and
// "Mike's Beer" are the same place; "Bar" alone is nothing.
const GENERIC = new Set(['the','a','an','of','at','on','in','and','bar','bars','pub','tavern','saloon','cafe','caffe','coffee','shop','house','restaurant','restaurante','ristorante','kitchen','grill','bistro','eatery','diner','pizzeria','bakery','brewery','brewing','taproom','lounge','company','co','inc','llc','pittsburgh','pgh']);
const SYNONYMS = {bros:'brothers',bro:'brother',st:'saint',ste:'saint',mt:'mount',n:'north',s:'south',e:'east',w:'west',ctr:'center',centre:'center',theatre:'theater'};

export function nameTokens(value) {
 const text = String(value ?? '').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase()
  .replace(/['’‘`´]/g,'').replace(/&|\+/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
 return text ? text.split(' ').map(t => SYNONYMS[t] || t) : [];
}
export function nameKey(value) {
 const tokens = nameTokens(value), core = tokens.filter(t => !GENERIC.has(t));
 return (core.length ? core : tokens.filter(t => !['the','a','an','and','of'].includes(t))).join(' ');
}
function editDistance(a, b) {
 if (a === b) return 0;
 let prev = Array.from({length: b.length + 1}, (_, i) => i), prev2 = null;
 for (let i = 1; i <= a.length; i++) {
  const row = [i];
  for (let j = 1; j <= b.length; j++) {
   row[j] = Math.min(prev[j] + 1, row[j-1] + 1, prev[j-1] + (a[i-1] === b[j-1] ? 0 : 1));
   if (prev2 && i > 1 && j > 1 && a[i-1] === b[j-2] && a[i-2] === b[j-1]) row[j] = Math.min(row[j], prev2[j-2] + 1);
  }
  prev2 = prev; prev = row;
 }
 return prev[b.length];
}
const ratio = (a, b) => !a || !b ? 0 : 1 - editDistance(a, b) / Math.max(a.length, b.length);
const tokenMatch = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && ratio(a, b) >= .75);

// 0..1: how likely two venue names refer to the same venue.
export function nameSimilarity(a, b) {
 const ka = nameKey(a), kb = nameKey(b);
 if (!ka || !kb) return 0;
 if (ka === kb) return 1;
 const joined = ratio(ka.replace(/ /g,''), kb.replace(/ /g,''));
 const ta = ka.split(' '), tb = kb.split(' ');
 const hitA = ta.filter(t => tb.some(u => tokenMatch(t, u))).length, hitB = tb.filter(t => ta.some(u => tokenMatch(t, u))).length;
 // Every distinctive word of the shorter name appears in the longer one:
 // "Primanti's" vs "Primanti Bros.". Weighted by how much of the longer name
 // is covered so "Fernando's" does not swallow "Fernando's Cafe & Grill Annex".
 const [short, long, hits] = ta.length <= tb.length ? [ta, tb, hitA] : [tb, ta, hitB];
 // A single short word ("Yard") inside a long name is too weak to count.
 const strong = short.length >= 2 ? short.join('').length >= 6 : short[0].length >= 5 && long.length <= 2;
 const contained = hits === short.length && strong ? .78 + .2 * (short.length / long.length) : 0;
 const dice = (hitA + hitB) / (ta.length + tb.length);
 return Math.min(1, Math.max(joined, contained, dice * .95));
}
export function distanceKm(a, b) {
 const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
 const h = Math.sin(dLat/2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng/2) ** 2;
 return 12742 * Math.asin(Math.sqrt(h));
}
const hasPoint = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng);
function kindAgreement(kind, category) {
 const a = normalizeKind(kind), b = normalizeKind(category);
 if (!a || a === 'event') return .5;
 if (a === b) return 1;
 const ga = venueGroup(a), gb = venueGroup(b);
 return ga && ga === gb ? .7 : 0;
}

export const NAME_THRESHOLD = .74;
export const SCORE_THRESHOLD = .62;
const MAX_MATCHES = 12;

// matchCandidates(candidates, places, near) ->
//   [{candidate, matches:[{place, score, reason, distanceKm}], ambiguous}]
// in candidate order. matches is [] when nothing clears the threshold.
// ambiguous is true when the user must pick (a chain or a near tie).
export function matchCandidates(candidates = [], places = [], near = null) {
 const origin = hasPoint(near) ? near : null;
 const pool = (Array.isArray(places) ? places : []).filter(p => p && typeof p.name === 'string' && p.name.trim());
 return (Array.isArray(candidates) ? candidates : []).map(candidate => {
  const label = candidate?.kind === 'event' && candidate?.venue ? candidate.venue : candidate?.venue || candidate?.name;
  if (!label || !nameKey(label)) return {candidate, matches: [], ambiguous: false};
  const scored = [];
  for (const place of pool) {
   const name = nameSimilarity(label, place.name);
   if (name < NAME_THRESHOLD) continue;
   const km = origin && hasPoint(place) ? distanceKm(origin, place) : null;
   // Within a few km is a strong signal, 25 km neutral, over 60 km a
   // different city: a same-named place there is not what the post meant.
   const proximity = km === null ? .5 : km <= 2 ? 1 : km <= 8 ? .85 : km <= 25 ? .6 : km <= 60 ? .25 : -2;
   const kind = kindAgreement(candidate.kind, place.category);
   const score = Math.round((name * .72 + proximity * .16 + kind * .12) * 1000) / 1000;
   if (score < SCORE_THRESHOLD) continue;
   const why = [name === 1 ? 'same name' : `similar name (${Math.round(name * 100)}%)`];
   if (km !== null) why.push(km < 1 ? `${Math.round(km * 1000)} m away` : `${Math.round(km * 10) / 10} km away`);
   if (kind === 1) why.push('same kind of place'); else if (kind === 0) why.push('different kind of place');
   scored.push({place, score, name, key: nameKey(place.name), reason: why.join(' · '), distanceKm: km === null ? null : Math.round(km * 100) / 100});
  }
  scored.sort((a, b) => b.score - a.score || (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  if (!scored.length) return {candidate, matches: [], ambiguous: false};
  const top = scored[0];
  // Branches of one chain share a name; distance alone cannot tell which one
  // the post was about, so every branch is offered, nearest first.
  const branches = scored.filter(s => s.key === top.key && s.name >= top.name - .001);
  let kept;
  if (branches.length > 1) {
   kept = branches.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
   kept.forEach(s => { s.reason += ` · one of ${branches.length} locations`; });
  } else kept = scored.filter(s => s.score >= top.score - .05);
  const matches = kept.slice(0, MAX_MATCHES).map(({place, score, reason, distanceKm}) => ({place, score, reason, distanceKm}));
  return {candidate, matches, ambiguous: matches.length > 1};
 });
}
