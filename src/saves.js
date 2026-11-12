// The Pile: things saved from anywhere. A save is an ordinary outing with
// status "saved", so storage, sync, backup and account removal already cover it.
import {SAVE_APPS, localDate, safeUrl, validDate, validateOuting, validatePlace} from './model.js';
import {parseSaveUrl, clipText, TRACKING as SHARE_TRACKING} from './saveSource.js';

const APP_HOSTS = [
  ['instagram', /(^|\.)instagram\.com$|(^|\.)instagr\.am$/],
  ['tiktok', /(^|\.)tiktok\.com$/],
  ['youtube', /(^|\.)youtube\.com$|^youtu\.be$/],
  ['google-maps', /^maps\.google\.[a-z.]+$|^maps\.app\.goo\.gl$/],
];
const host = url => new URL(url).hostname.toLowerCase().replace(/^(www|m)\./, '');
export function appFor(url) {
  const safe = safeUrl(url);
  if (!safe) return 'note';
  const h = host(safe), path = new URL(safe).pathname;
  if (/^google\.[a-z.]+$/.test(h) && path.startsWith('/maps')) return 'google-maps';
  if (h === 'goo.gl' && path.startsWith('/maps')) return 'google-maps';
  return APP_HOSTS.find(([, pattern]) => pattern.test(h))?.[0] || 'web';
}
// What to call an outing in a list or prompt. A save may have no place yet, so
// fall back to what was saved: its note or caption, then the link's site.
export function outingLabel(outing) {
  if (outing?.place?.name) return outing.place.name;
  const note = typeof outing?.source?.text === 'string' ? outing.source.text.trim() : '';
  if (note) return note.length > 80 ? `${note.slice(0, 79)}…` : note;
  const link = safeUrl(outing?.source?.url || '');
  return link ? host(link) : 'Saved item';
}
const stampOf = now => (now instanceof Date ? now : new Date(now ?? Date.now())).toISOString();

export function makeSave({url = '', app, text = '', place = null, eventDate = '', expiresAt = '', now = new Date()} = {}) {
  const stamp = stampOf(now);
  let link = typeof url === 'string' ? url.trim() : url;
  // "instagram.com/reel/x" pasted without a scheme: the resolver reads it as a
  // link, so the record must store it as one instead of rejecting it.
  if (typeof link === 'string' && link && !/^[a-z][a-z0-9+.-]*:/i.test(link) && parseSaveUrl(link).app !== 'note') link = `https://${link}`;
  if (!link && !(typeof text === 'string' && text.trim()) && !place) throw Error('Nothing to save. Paste a link or type a note.');
  return validateOuting({
    id: crypto.randomUUID(),
    place: place ? validatePlace(place) : null,
    status: 'saved', planDate: '', visitDate: '', notes: '', with: '', rating: 0, photos: [],
    source: {url: link, app: SAVE_APPS.includes(app) ? app : appFor(link), text: typeof text === 'string' ? clipText(text.trim()) : text, savedAt: stamp, eventDate, expiresAt},
    createdAt: stamp, updatedAt: stamp,
  });
}

export function attachPlace(save, place, now = new Date()) {
  if (save?.status !== 'saved') throw Error('Only a save can be matched to a place.');
  return validateOuting({...save, place: validatePlace(place), updatedAt: stampOf(now)});
}

// The save keeps its source so later picks can say where the idea came from.
export function saveToPlan(save, planDate = '', now = new Date()) {
  if (save?.status !== 'saved') throw Error('Only a save can become a plan.');
  if (!save.place) throw Error('Choose the place before planning this save.');
  if (planDate && !validDate(planDate)) throw Error('Choose a valid plan date.');
  return validateOuting({...save, status: 'planned', planDate, updatedAt: stampOf(now)});
}

// Last day it is worth doing: an explicit end date wins over the event date.
export const lastDay = save => save?.source?.expiresAt || save?.source?.eventDate || '';

export function isExpired(save, today = localDate()) {
  const end = lastDay(save);
  return save?.status === 'saved' && !!end && end < today;
}

function addDays(day, days) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
}
export function expiringSoon(saves, today = localDate(), days = 7) {
  const limit = addDays(today, days);
  return saves
    .filter(s => s?.status === 'saved' && lastDay(s) && lastDay(s) >= today && lastDay(s) <= limit)
    .sort((a, b) => lastDay(a).localeCompare(lastDay(b)) || a.id.localeCompare(b.id));
}

// Share sheets append tracking parameters that differ on every share.
const TRACKING = /^(utm_.*|igsh|igshid|fbclid|gclid|mibextid|si|feature|ref|ref_src|is_from_webapp|sender_device|share_id|share_app_id|_r|_t|_nc_.*)$/i;
function canonicalUrl(value) {
  const safe = safeUrl(value);
  if (!safe) return '';
  const url = new URL(safe), h = host(safe);
  let path = url.pathname.replace(/\/+$/, '') || '/';
  const params = [...url.searchParams].filter(([k]) => !TRACKING.test(k) && !SHARE_TRACKING.test(k));
  if (h === 'youtu.be') return `youtube.com/watch?v=${path.slice(1)}`;
  if (h === 'youtube.com' && path.startsWith('/shorts/')) return `youtube.com/watch?v=${path.split('/')[2]}`;
  if (h === 'instagram.com') path = path.replace(/^\/reels\//, '/reel/');
  params.sort(([a, x], [b, y]) => a.localeCompare(b) || x.localeCompare(y));
  const query = params.length ? `?${new URLSearchParams(params)}` : '';
  return `${h}${path}${query}`;
}
export function dedupeKey(save) {
  const link = canonicalUrl(save?.source?.url || '');
  if (link) return `url:${link}`;
  if (save?.place?.id) return `place:${save.place.id}`;
  const note = (save?.source?.text || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  return note ? `note:${note}` : '';
}
// The existing record for this save, if the same thing was already saved.
export function findDuplicate(outings, save) {
  const key = dedupeKey(save);
  return key ? outings.find(o => o.id !== save.id && o.source && dedupeKey(o) === key) || null : null;
}
