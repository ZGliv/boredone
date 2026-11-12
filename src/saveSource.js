// Pure helpers for a "save": a shared link plus whatever text came with it.
// Shared by the client and server/resolve-save.js. Nothing here fetches.
export const SAVE_APPS = ['instagram','tiktok','youtube','google-maps','web','note'];
const NOTE = Object.freeze({app:'note',kind:'note',id:'',canonicalUrl:'',hint:''});
// Click-tracking and share-attribution parameters. They identify the sharer,
// not the thing shared, so they never belong in a saved record.
const TRACKING = /^(utm_[a-z_]+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|_hsenc|_hsmi|igsh|igshid|ig_rid|ig_mid|si|feature|ref|ref_src|ref_url|share_id|share_app_id|share_link_id|is_from_webapp|is_copy_url|sender_device|sender_web_id|_r|_t|_d|tt_from|u_code|preview_pb|sec_uid|social_sharing|g_ep|g_st|ved|rlz|sourceid|spm|smid|cmpid|ocid|mibextid)$/i;
const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g,'').trim();

function toUrl(input) {
 let text = clean(input);
 if (!text || text.length > 2048 || /\s/.test(text)) return null;
 if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) {
  // "instagram.com/reel/x" pasted without a scheme. A bare word is not a URL.
  if (!/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/?#:]|$)/i.test(text)) return null;
  text = 'https://' + text;
 }
 try {
  const url = new URL(text);
  if (!['http:','https:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) return null;
  return url;
 } catch { return null; }
}
const hostIs = (host, domain) => host === domain || host.endsWith('.' + domain);
const segments = url => url.pathname.split('/').filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch { return s; } });
const safeId = value => /^[A-Za-z0-9_.@-]{1,120}$/.test(value || '') ? value : '';

function instagram(url) {
 const p = segments(url), share = p[0] === 'share';
 const parts = share ? p.slice(1) : p;
 // /reel/ID, /p/ID, /tv/ID, /reels/ID and the newer /{user}/reel/ID form.
 const at = parts.findIndex(s => ['reel','reels','p','tv'].includes(s));
 if (at >= 0 && safeId(parts[at+1])) {
  const id = parts[at+1], kind = parts[at] === 'p' ? 'post' : parts[at] === 'tv' ? 'video' : 'reel';
  // Share tokens are opaque; they are not a reel id and cannot be shortened.
  if (share) return {app:'instagram',kind:'share',id,canonicalUrl:`https://www.instagram.com/share/${parts[at]}/${id}/`,hint:''};
  return {app:'instagram',kind,id,canonicalUrl:`https://www.instagram.com/${parts[at]==='reels'?'reel':parts[at]}/${id}/`,hint:''};
 }
 if (share && safeId(parts[0])) return {app:'instagram',kind:'share',id:parts[0],canonicalUrl:`https://www.instagram.com/share/${parts[0]}/`,hint:''};
 const reserved = ['explore','stories','accounts','direct','about','legal','developer','web','p','reel','reels','tv','share'];
 if (parts.length && /^[A-Za-z0-9_.]{1,30}$/.test(parts[0]) && !reserved.includes(parts[0])) {
  if (parts[1] === 'stories' || p[0] === 'stories') return {app:'instagram',kind:'story',id:'',canonicalUrl:'',hint:''};
  return {app:'instagram',kind:'profile',id:parts[0],canonicalUrl:`https://www.instagram.com/${parts[0]}/`,hint:'@'+parts[0]};
 }
 if (p[0] === 'stories' && /^[A-Za-z0-9_.]{1,30}$/.test(p[1] || '')) return {app:'instagram',kind:'story',id:p[1],canonicalUrl:`https://www.instagram.com/${p[1]}/`,hint:'@'+p[1]};
 return {app:'instagram',kind:'link',id:'',canonicalUrl:'https://www.instagram.com/',hint:''};
}
function tiktok(url) {
 const host = url.hostname.toLowerCase(), p = segments(url);
 if (['vm.tiktok.com','vt.tiktok.com'].includes(host) && safeId(p[0])) return {app:'tiktok',kind:'short',id:p[0],canonicalUrl:`https://${host}/${p[0]}/`,hint:''};
 if (p[0] === 't' && safeId(p[1])) return {app:'tiktok',kind:'short',id:p[1],canonicalUrl:`https://www.tiktok.com/t/${p[1]}/`,hint:''};
 const user = /^@[A-Za-z0-9_.]{1,40}$/.test(p[0] || '') ? p[0] : '';
 if (user && ['video','photo'].includes(p[1]) && /^\d{5,25}$/.test(p[2] || '')) return {app:'tiktok',kind:p[1],id:p[2],canonicalUrl:`https://www.tiktok.com/${user}/${p[1]}/${p[2]}`,hint:user};
 if (user) return {app:'tiktok',kind:'profile',id:user.slice(1),canonicalUrl:`https://www.tiktok.com/${user}`,hint:user};
 return {app:'tiktok',kind:'link',id:'',canonicalUrl:'https://www.tiktok.com/',hint:''};
}
function youtube(url) {
 const host = url.hostname.toLowerCase(), p = segments(url), v = /^[A-Za-z0-9_-]{6,20}$/;
 if (host === 'youtu.be' && v.test(p[0] || '')) return {app:'youtube',kind:'video',id:p[0],canonicalUrl:`https://www.youtube.com/watch?v=${p[0]}`,hint:''};
 if (['shorts','live','embed'].includes(p[0]) && v.test(p[1] || '')) return {app:'youtube',kind:p[0]==='shorts'?'short':'video',id:p[1],canonicalUrl:p[0]==='shorts'?`https://www.youtube.com/shorts/${p[1]}`:`https://www.youtube.com/watch?v=${p[1]}`,hint:''};
 const id = url.searchParams.get('v');
 if (p[0] === 'watch' && v.test(id || '')) return {app:'youtube',kind:'video',id,canonicalUrl:`https://www.youtube.com/watch?v=${id}`,hint:''};
 if (/^@[A-Za-z0-9_.-]{1,40}$/.test(p[0] || '')) return {app:'youtube',kind:'profile',id:p[0].slice(1),canonicalUrl:`https://www.youtube.com/${p[0]}`,hint:p[0]};
 return {app:'youtube',kind:'link',id:'',canonicalUrl:'https://www.youtube.com/',hint:''};
}
function googleMaps(url) {
 const host = url.hostname.toLowerCase(), p = segments(url);
 if (host === 'maps.app.goo.gl' && safeId(p[0])) return {app:'google-maps',kind:'short',id:p[0],canonicalUrl:`https://maps.app.goo.gl/${p[0]}`,hint:''};
 if (host === 'goo.gl' && p[0] === 'maps' && safeId(p[1])) return {app:'google-maps',kind:'short',id:p[1],canonicalUrl:`https://goo.gl/maps/${p[1]}`,hint:''};
 const maps = p[0] === 'maps' ? p.slice(1) : p;
 if (maps[0] === 'place' && maps[1]) {
  // The place segment is the venue name as Google displays it, '+' for spaces.
  const name = maps[1].replace(/\+/g,' ').replace(/\s+/g,' ').trim().slice(0,160);
  return {app:'google-maps',kind:'place',id:name,canonicalUrl:`https://www.google.com/maps/place/${encodeURIComponent(name).replace(/%20/g,'+')}/`,hint:name};
 }
 if (maps[0] === 'search' && maps[1]) {
  const query = maps[1].replace(/\+/g,' ').trim().slice(0,160);
  return {app:'google-maps',kind:'search',id:query,canonicalUrl:`https://www.google.com/maps/search/${encodeURIComponent(query).replace(/%20/g,'+')}/`,hint:/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(query)?'':query};
 }
 const cid = url.searchParams.get('cid');
 if (/^\d{5,25}$/.test(cid || '')) return {app:'google-maps',kind:'place',id:cid,canonicalUrl:`https://maps.google.com/?cid=${cid}`,hint:''};
 const q = clean(url.searchParams.get('q') || url.searchParams.get('query')).slice(0,160);
 if (q) return {app:'google-maps',kind:'search',id:q,canonicalUrl:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,hint:/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(q)?'':q};
 return {app:'google-maps',kind:'link',id:'',canonicalUrl:'https://www.google.com/maps',hint:''};
}
const isGoogleMaps = (host, url) => host === 'maps.app.goo.gl' || (host === 'goo.gl' && url.pathname.startsWith('/maps')) || host === 'maps.google.com' || (/^(www\.)?google\.[a-z.]{2,6}$/.test(host) && url.pathname.startsWith('/maps'));

// parseSaveUrl(url) -> {app, kind, id, canonicalUrl, hint}. hint is text the
// link itself carries (a Google Maps place name, an @handle); it is "" when
// the link says nothing about what was shown. Never throws.
export function parseSaveUrl(input) {
 try {
  const url = toUrl(input);
  if (!url) return {...NOTE};
  const host = url.hostname.toLowerCase().replace(/\.$/,'');
  if (hostIs(host,'instagram.com') || host === 'instagr.am') return instagram(url);
  if (hostIs(host,'tiktok.com')) return tiktok(url);
  if (hostIs(host,'youtube.com') || host === 'youtu.be') return youtube(url);
  if (isGoogleMaps(host, url)) return googleMaps(url);
  for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
  url.hash = '';
  url.hostname = host;
  return {app:'web',kind:'page',id:'',canonicalUrl:url.toString(),hint:''};
 } catch { return {...NOTE}; }
}

// A share sheet often hands over one blob: "Check this out! https://...".
// splitShare separates the first link from the words around it.
export function splitShare(url = '', text = '') {
 const blob = clean(text).slice(0, 20000);
 let link = clean(url);
 let rest = blob;
 if (!link) {
  const found = blob.match(/\bhttps?:\/\/[^\s<>"']+/i);
  if (found) { link = found[0].replace(/[).,!?;:]+$/,''); rest = blob.replace(found[0],' '); }
 }
 return {url: link, text: rest.replace(/\bhttps?:\/\/[^\s<>"']+/gi,' ').replace(/[ \t]+/g,' ').replace(/\s*\n\s*/g,'\n').trim()};
}

const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
// Whole day and month names or their usual abbreviations only: "sunny",
// "satisfying", "mayor" or "marching" are not dates.
const WEEKDAY = '(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)';
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const iso = date => date.toISOString().slice(0,10);
const utcDay = value => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || ''); if (!m) return null; const d = new Date(Date.UTC(+m[1], +m[2]-1, +m[3])); return iso(d) === value ? d : null; };
export const isIsoDate = value => !!utcDay(value);
const addDays = (date, n) => new Date(date.getTime() + n * 86400000);

// resolveDatePhrase("this Saturday", "2026-11-11") -> "2026-11-14". Handles
// today/tonight/tomorrow, (this|next) <weekday>, this weekend, and explicit
// month-day dates (rolling into next year when the date has passed). Returns
// "" when the phrase is not a date it can resolve with certainty.
export function resolveDatePhrase(phrase, today) {
 const base = utcDay(today);
 const text = clean(phrase).toLowerCase().replace(/[.,!]/g,' ').replace(/\s+/g,' ').trim();
 if (!base || !text || text.length > 60) return '';
 if (isIsoDate(text)) return text;
 if (/^(today|tonight|this evening)$/.test(text)) return iso(base);
 if (/^tomorrow( night)?$/.test(text)) return iso(addDays(base,1));
 if (/^this weekend$/.test(text)) { const d = base.getUTCDay(); return iso(addDays(base, d === 6 || d === 0 ? 0 : 6 - d)); }
 const day = text.match(new RegExp(`^(this |next |on |coming )?${WEEKDAY}( night)?$`));
 if (day) {
  const target = DAYS.findIndex(d => d.startsWith(day[2].slice(0,3)));
  let delta = (target - base.getUTCDay() + 7) % 7;
  // "next Friday" said on a Wednesday is ambiguous in English; only accept
  // "next" when the weekday has already passed this week or is today.
  if (day[1] === 'next ') { if (delta === 0) delta = 7; else return ''; }
  return iso(addDays(base, delta));
 }
 let m = text.match(new RegExp(`^(?:${WEEKDAY} )?${MONTH} (\\d{1,2})(?:st|nd|rd|th)?(?: (\\d{4}))?$`)) || null, month, date, year;
 if (m) { month = MONTHS.indexOf(m[2].slice(0,3)); date = +m[3]; year = m[4] ? +m[4] : null; }
 else if ((m = text.match(new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)? (?:of )?${MONTH}(?: (\\d{4}))?$`)))) { month = MONTHS.indexOf(m[2].slice(0,3)); date = +m[1]; year = m[3] ? +m[3] : null; }
 else if ((m = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/))) { month = +m[1]-1; date = +m[2]; year = m[3] ? +m[3] : null; }
 else return '';
 const y = year ?? base.getUTCFullYear();
 let candidate = new Date(Date.UTC(y, month, date));
 if (candidate.getUTCMonth() !== month) return '';
 if (year === null && candidate < addDays(base, -1)) candidate = new Date(Date.UTC(y + 1, month, date));
 return iso(candidate);
}

// The `source` field of a save record. text is what the user or share sheet
// supplied; nothing in it is generated.
export function saveSource({url = '', text = '', savedAt, eventDate = '', expiresAt = ''} = {}) {
 const parsed = parseSaveUrl(url);
 return {url: parsed.canonicalUrl, app: parsed.app, text: clean(text).slice(0,4000), savedAt: savedAt || new Date().toISOString(), eventDate: isIsoDate(eventDate) ? eventDate : '', expiresAt: isIsoDate(expiresAt) ? expiresAt : ''};
}
