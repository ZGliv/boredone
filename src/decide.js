import {distance, editorialFreshness} from './recommendations.js';
import {normalizeKind, venueGroup} from './venues.js';
import {placeKind} from './exploration.js';
import {isSuppressedVenue} from './venueCorrections.js';
import {sameVenue} from './cityBoard.js';

// Tonight's Three. Pure: the caller supplies "now" and a seed, so the same
// inputs always give the same picks. Nothing here reads the clock, storage or
// network, and every reason is built from a field the record actually has.
// Opening hours are never parsed or implied; there is no price data, so there
// is no budget dial.

const DAY = 86400000, HOUR = 3600000;
const RECENT_DAYS = 14;
// "Tonight" runs until 5 am, the same reset the Tonight list uses, so the
// session day is the local date five hours ago.
const RESET_HOURS = 5;
// Something longer than this (an exhibition, a festival) is never "on now".
const LONG_EVENT_MS = 18 * HOUR;
// An event with no map location is ranked as if this far away, and the
// result says its distance is unknown.
const UNKNOWN_EVENT_KM = 5;
const APPS = {instagram:'Instagram', tiktok:'TikTok', youtube:'YouTube', 'google-maps':'Google Maps', web:'the web', note:'a note'};

// Energy dial: low keeps it close and easy (food, coffee, drinks); high
// tolerates distance and leans to shows, activities and events.
const ENERGY = {
 low: {perKm:4, groups:{food:6, coffee:6, drinks:6, culture:-4, play:-4, event:-4}, note:'Low energy: favouring nearby food, coffee and drinks.'},
 high: {perKm:1, groups:{culture:6, play:6, event:6}, note:'Up for anything: farther places, shows and activities get a lift.'},
};
// Companions dial: small nudges only, never exclusions. Family steers away
// from bars and clubs; friends toward bars and games; a date toward dinner,
// drinks and shows; solo toward coffee and culture you can enjoy alone.
const COMPANIONS = {
 solo: {groups:{coffee:3, culture:3}, note:'Solo: a small lift for coffee and culture.'},
 date: {groups:{food:3, drinks:3, culture:2, event:2}, note:'Date: a small lift for dinner, drinks and shows.'},
 friends: {groups:{drinks:3, play:4, event:2}, note:'Friends: a small lift for bars, games and events.'},
 family: {groups:{play:4, food:2, coffee:2, drinks:-6}, note:'Family: a small lift for food and activities; bars are nudged down.'},
};

function parseNow(value){
 const match=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|([+-])(\d{2}):?(\d{2}))$/.exec(value||'');
 const ms=Date.parse(value);
 if(!match||!Number.isFinite(ms))throw new TypeError('decideTonight needs context.now as an ISO time with an offset.');
 const offset=match[3]==='Z'?0:(match[4]==='-'?-1:1)*(Number(match[5])*60+Number(match[6]));
 return {ms, offset};
}
// Wall-clock date and time of an instant in the caller's zone.
function local(ms, offset){const iso=new Date(ms+offset*60000).toISOString();return {date:iso.slice(0,10), hour:Number(iso.slice(11,13)), minute:Number(iso.slice(14,16))};}
const dayNumber=date=>/^\d{4}-\d{2}-\d{2}$/.test(date||'')&&Number.isFinite(Date.parse(date+'T00:00:00Z'))?Date.parse(date+'T00:00:00Z')/DAY:null;
function clock(hour, minute){return `${hour%12||12}:${String(minute).padStart(2,'0')} ${hour<12?'am':'pm'}`;}
function kmText(km){return km<1?`${Math.max(50,Math.round(km*20)*50)} m away`:`${km<10?km.toFixed(1):Math.round(km)} km away`;}
function ageText(days){
 if(days===0)return 'Saved today';
 if(days===1)return 'Saved yesterday';
 if(days<14)return `Saved ${days} days ago`;
 if(days<60)return `Saved ${Math.floor(days/7)} weeks ago`;
 if(days<365){const months=Math.min(11,Math.floor(days/30));return `Saved ${months} month${months===1?'':'s'} ago`;}
 const years=Math.floor(days/365);return years===1?'Saved a year ago':`Saved ${years} years ago`;
}
const hasCoords=x=>x&&typeof x.lat==='number'&&typeof x.lng==='number'&&Number.isFinite(x.lat)&&Number.isFinite(x.lng);
const groupOf=place=>venueGroup(place.category)||placeKind(place.category||'');
const kindOf=place=>normalizeKind(place?.category);
// An event's own offset is the venue's wall clock (and survives a DST change
// overnight); a UTC or offset-less time falls back to the caller's zone.
function offsetOf(value, fallback){
 const match=/([+-])(\d{2}):?(\d{2})$/.exec(value||'');
 return match?(match[1]==='-'?-1:1)*(Number(match[2])*60+Number(match[3])):fallback;
}
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WEEKDAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
// "Nov 14", or "Jan 3, 2027" when the year is not the current one.
function dateText(day, today){
 const iso=new Date(day*DAY).toISOString();
 const text=`${MONTHS[Number(iso.slice(5,7))-1]} ${Number(iso.slice(8,10))}`;
 return iso.slice(0,4)===new Date(today*DAY).toISOString().slice(0,4)?text:`${text}, ${iso.slice(0,4)}`;
}
const weekdayText=(day, today)=>`${WEEKDAYS[new Date(day*DAY).getUTCDay()]}, ${dateText(day, today)}`;
// The Done sheet's own words for a rating: 5 is "Loved it"; 4 (older records) "Good".
const felt=rating=>rating>=5?'loved':'liked';
// Plain words for a place's kind when nothing else is known: "Restaurant in German Village".
function kindText(place){
 const kind=normalizeKind(place.category).replace(/_/g,' ');
 if(!kind)return '';
 const hood=typeof place.neighborhood==='string'&&place.neighborhood.trim()?place.neighborhood.trim():'';
 return `${kind[0].toUpperCase()}${kind.slice(1)}${hood?` in ${hood}`:''}`;
}

// sameVenue only looks within 0.0012 degrees of latitude (about 120 m), so
// each lookup needs only its own band of the list and the two beside it.
// Same answers as passing the whole list, without scanning thousands of places.
const BAND=0.0012;
function latBands(list){
 const bands=new Map();
 for(const p of list){const k=Math.floor(p.lat/BAND);if(!bands.has(k))bands.set(k,[]);bands.get(k).push(p);}
 return place=>{const k=Math.floor(place.lat/BAND);return [...(bands.get(k-1)||[]),...(bands.get(k)||[]),...(bands.get(k+1)||[])];};
}

// FNV-1a then a 32-bit mix: a stable 0..1 value per (seed, candidate), so the
// tie-breaking jitter does not depend on the order inputs arrive in.
function unit(seed, key){
 let h=2166136261;
 for(const ch of `${seed}|${key}`){h^=ch.codePointAt(0);h=Math.imul(h,16777619);}
 h^=h>>>15;h=Math.imul(h,2246822507);h^=h>>>13;h=Math.imul(h,3266489909);h^=h>>>16;
 return (h>>>0)/4294967296;
}

// Weekend = the coming (or current) Friday to Sunday.
function weekend(today){
 const weekday=new Date(today*DAY).getUTCDay();
 const start=weekday===0?today-2:weekday===6?today-1:weekday===5?today:today+(5-weekday);
 return {start, end:start+2};
}

// Clock facts for a save: what boosts it and the honest sentence for it.
// `today` is the session day, so after midnight a Friday save is still on.
// A save dated another day names that day; it never reads as tonight.
function saveClock(source, today, wk, late){
 const event=dayNumber(source?.eventDate), expires=dayNumber(source?.expiresAt);
 if((event!==null&&event<today)||(expires!==null&&expires<today))return {passed:true};
 // Between midnight and 5 am "today" is already the next date, so say tonight.
 if(event===today)return {boost:50, reason:late?'Happening tonight':'Happening today'};
 if(expires===today)return {boost:50, reason:late?'Final night tonight':'Last day today'};
 // Closes after this weekend starts but before the next one: last chance.
 if(expires!==null&&expires>=wk.start&&expires<wk.start+7)return {boost:35, reason:'Last weekend before it closes'};
 if(event!==null&&event>=wk.start&&event<=wk.end)return {boost:30, reason:`On ${weekdayText(event, today)}`};
 if(expires!==null&&expires-today<=7)return {boost:15, reason:expires-today===1?'Ends tomorrow':`Ends in ${expires-today} days`};
 if(event!==null&&event-today<=7)return {boost:10, reason:`On ${weekdayText(event, today)}`};
 return {boost:0};
}

export function decideTonight({saves=[], places=[], events=[], outings=[], context={}, exclude=[], seed=0}={}){
 const {ms:now, offset}=parseNow(context.now);
 // Two clocks: the calendar date (for "saved yesterday", "you went today")
 // and the session day, which runs until 5 am (for what counts as tonight).
 const nowLocal=local(now, offset), calendarToday=dayNumber(nowLocal.date);
 const today=dayNumber(local(now-RESET_HOURS*HOUR, offset).date), wk=weekend(today);
 const sessionDay=(ms, off)=>dayNumber(local(ms-RESET_HOURS*HOUR, off).date);
 const tonightEnd=(today+1)*DAY+RESET_HOURS*HOUR-offset*60000;
 const location=hasCoords(context.location)?context.location:null;
 const maxKm=location&&Number.isFinite(context.maxKm)&&context.maxKm>0?context.maxKm:null;
 const energy=ENERGY[context.energy]||null, company=COMPANIONS[context.companions]||null;
 const perKm=energy?.perKm??2;
 const notes=['Opening hours are not checked; confirm before you go.'];
 if(!location)notes.push('Your location is unknown, so distance is not used.');
 if(!location&&Number.isFinite(context.maxKm))notes.push('The distance limit needs your location, so it was not applied.');
 if(energy)notes.push(energy.note);
 if(company)notes.push(company.note);

 const placeById=new Map(places.filter(p=>p&&p.id).map(p=>[p.id,p]));
 const listed=[...placeById.values()].filter(hasCoords);
 // Journal records keep the id of the guide they were saved from; a city pack
 // lists the same venue under its own id. Same rule as the city board
 // (cityBoard.sameVenue): an id in the list wins, else the same venue name
 // within 120 m, else a near-identical name within 60 m.
 const idCache=new Map(), listedNear=latBands(listed);
 const idOf=place=>{
  if(!place?.id||placeById.has(place.id)||!hasCoords(place))return place?.id||'';
  if(!idCache.has(place.id))idCache.set(place.id, sameVenue(place, listedNear(place))?.place.id||place.id);
  return idCache.get(place.id);
 };

 // History per place: latest rated visit decides likes and exclusions.
 const visits=new Map(), planned=new Set();
 for(const o of outings){
  const id=idOf(o?.place);if(!id)continue;
  if(o.status==='planned')planned.add(id);
  if(o.status!=='visited'||!o.visitDate)continue;
  const row=visits.get(id)||{last:'', rated:null, name:o.place.name, category:o.place.category, place:o.place};
  if(o.visitDate>row.last)row.last=o.visitDate;
  if(o.rating>0&&(!row.rated||o.visitDate>row.rated.visitDate))row.rated=o;
  visits.set(id,row);
 }
 // A list can hold one venue twice (two records a few metres apart under
 // slightly different names); a visit to either copy is history for both.
 const visitedPlaces=[...visits].filter(([,row])=>hasCoords(row.place)).map(([id,row])=>({...row.place, id}));
 const visitedNear=latBands(visitedPlaces);
 const rowCache=new Map();
 const historyOf=place=>{
  if(!place)return null;
  const id=idOf(place);
  if(visits.has(id))return visits.get(id);
  if(!hasCoords(place)||!visitedPlaces.length)return null;
  if(!rowCache.has(id)){const hit=sameVenue(place, visitedNear(place));rowCache.set(id, hit?visits.get(hit.place.id):null);}
  return rowCache.get(id);
 };
 const ratingOf=row=>row?.rated?.rating||0;
 const lowRated=row=>{const r=ratingOf(row);return r>0&&r<=2;};
 // Best loved place per kind, used only to explain "like X, which you rated 5".
 const loved=new Map();
 for(const [id,row] of visits){
  const r=ratingOf(row);if(r<4)continue;
  const k=kindOf(row);if(!k)continue;const prior=loved.get(k);
  if(!prior||r>prior.rating||(r===prior.rating&&(row.last>prior.last||(row.last===prior.last&&id<prior.id))))loved.set(k,{id,name:row.name,rating:r,last:row.last});
 }

 const candidates=[];let passed=0, tooFar=0, unlocated=0, unlocatedOut=0;
 const distanceTo=x=>location&&hasCoords(x)?distance(location,x):null;
 // Shared facts for anything tied to a known place. Returns null if excluded.
 function placeFacts(place, own){
  if(!place)return {score:0, reasons:[], group:'unconfirmed'};
  const id=idOf(place), row=historyOf(place);
  if(lowRated(row))return null;
  const km=distanceTo(place);
  if(maxKm&&km!==null&&km>maxKm){tooFar++;return null;}
  const group=groupOf(place), reasons=[];let score=0;
  if(km!==null){score-=Math.min(km,15)*perKm;reasons.push(kmText(km));}
  const r=ratingOf(row);
  if(row){
   const ago=calendarToday-dayNumber(row.last);
   // A visit dated after "now" (clock or zone skew) is not described as past.
   if(ago>=0&&ago<=RECENT_DAYS){score-=40;reasons.push(ago===0?'You went today':ago===1?'You went yesterday':`You went ${ago} days ago`);}
   if(r>=4){score+=12;reasons.push(`You ${felt(r)} it last time`);}
  }else{
   const like=loved.get(kindOf(place));
   if(like&&like.id!==id){score+=own?6:15;reasons.push(`Like ${like.name}, which you ${felt(like.rating)}`);}
  }
  if(planned.has(id)&&!own){score+=40;reasons.unshift('Already in your plans');}
  if(place.recommendation?.text){const f=editorialFreshness(place.recommendation, now);if(f==='dated'){score+=8;reasons.push(`Guide entry updated ${place.recommendation.listingUpdated}`);}}
  score+=energy?.groups[group]||0;score+=company?.groups[group]||0;
  return {score, reasons, group};
 }

 // 1. The user's own saves come first. One save per place (newest wins).
 const savedPlaceIds=new Set(), seenSaves=new Set();
 const orderedSaves=saves.filter(s=>s&&s.status==='saved'&&s.id).sort((a,b)=>(b.source?.savedAt||'').localeCompare(a.source?.savedAt||'')||String(a.id).localeCompare(String(b.id)));
 for(const save of orderedSaves){
  const place=save.place&&save.place.id?save.place:null;
  if(seenSaves.has(save.id))continue;seenSaves.add(save.id);
  const timing=saveClock(save.source, today, wk, nowLocal.hour<RESET_HOURS);
  if(timing.passed){passed++;continue;}
  if(place&&(savedPlaceIds.has(idOf(place))||isSuppressedVenue(place, now)))continue;
  if(place)savedPlaceIds.add(idOf(place));
  const facts=placeFacts(place, true);if(!facts)continue;
  const reasons=[];let score=100+timing.boost+facts.score;
  if(timing.reason)reasons.push(timing.reason);
  const savedMs=Date.parse(save.source?.savedAt);
  // Calendar days in the caller's zone: a save from last night is "yesterday".
  if(Number.isFinite(savedMs)&&savedMs<=now){const days=calendarToday-dayNumber(local(savedMs, offset).date);score+=Math.min(Math.floor(days/7),4);reasons.push(ageText(days));}
  if(!place){score-=5;const app=APPS[save.source?.app];reasons.push(`${app?`Saved from ${app}`:'Saved'} · place still needs confirming`);}
  reasons.push(...facts.reasons);
  if(place&&!facts.reasons.length&&reasons.length<3){const k=kindText(place);if(k)reasons.push(k);}
  candidates.push({key:`save:${save.id}`, raw:save.id, kind:'save', save, place:place||undefined, score, reasons, group:facts.group});
 }

 // 2. Events happening tonight (starting later tonight, or under way now).
 const seenEvents=new Set();
 for(const event of events){
  if(!event?.id||seenEvents.has(event.id))continue;seenEvents.add(event.id);
  const start=Date.parse(event.start), end=event.end?Date.parse(event.end):NaN;
  if(!Number.isFinite(start))continue;
  const startOffset=offsetOf(event.start, offset), endOffset=offsetOf(event.end, offset);
  const at=local(start, startOffset);
  // Date-only listings (a market "on Saturday") have no clock time to quote.
  const allDay=event.allDay===true||(at.hour===0&&at.minute===0&&Number.isFinite(end)&&end>start&&local(end, endOffset).hour===0&&local(end, endOffset).minute===0);
  let timeReason;
  if(allDay){
   const first=dayNumber(at.date), last=Number.isFinite(end)&&end>start?dayNumber(local(end-1, endOffset).date):first;
   if(today<first||today>last)continue;
   timeReason=last===today?'On today':`Runs until ${dateText(last, today)}`;
  }else{
   const upcoming=start>=now&&start<tonightEnd&&sessionDay(start, startOffset)===today, underway=start<now&&Number.isFinite(end)&&end>now;
   if(!upcoming&&!underway)continue;
   // "Tonight" only for evening and small-hours starts; a midday start is "today".
   if(upcoming)timeReason=`Starts ${clock(at.hour,at.minute)} ${at.hour>=17||at.hour<5?'tonight':'today'}`;
   else{
    const e=local(end, endOffset);
    // An exhibition or a festival is not "on now" at 2 am: give the run, not the moment.
    timeReason=end-start>LONG_EVENT_MS?`Runs until ${dateText(dayNumber(e.date), today)}`:end>tonightEnd?`On now until ${dateText(dayNumber(e.date), today)}`:`On now until ${clock(e.hour,e.minute)}`;
   }
  }
  const place=event.placeId?placeById.get(event.placeId)||null:null;
  // The linked venue, or the event's own name and point when the venue is not in `places`.
  const venue=place||(event.placeId&&hasCoords(event)?{id:event.placeId, name:event.venueName, lat:event.lat, lng:event.lng}:null);
  const venueRow=venue?historyOf(venue):visits.get(event.placeId)||null;
  if(lowRated(venueRow))continue;
  if(place&&isSuppressedVenue(place, now))continue;
  // An event without its own coordinates uses its linked venue's.
  const spot=hasCoords(event)?event:hasCoords(place)?place:null;
  const km=distanceTo(spot);
  if(location&&km===null){
   // The distance limit cannot be checked, so it is not offered under one.
   if(maxKm){unlocatedOut++;continue;}
   unlocated++;
  }
  if(maxKm&&km!==null&&km>maxKm){tooFar++;continue;}
  const reasons=[timeReason];
  let score=60+(energy?.groups.event||0)+(company?.groups.event||0);
  const venueRating=ratingOf(venueRow);
  if(event.placeId&&savedPlaceIds.has(event.placeId)){score+=20;reasons.push('At a place you saved');}
  else if(event.placeId&&venueRating>=4){score+=10;reasons.push(`You ${felt(venueRating)} ${event.venueName||'the venue'} last time`);}
  if(km!==null){score-=Math.min(km,15)*perKm;reasons.push(kmText(km));}
  else if(location)score-=UNKNOWN_EVENT_KM*perKm;
  if(event.venueName)reasons.push(`At ${event.venueName}`);
  candidates.push({key:`event:${event.id}`, raw:event.id, kind:'event', event, place:place||undefined, score, reasons, group:'event'});
 }

 // 3. Places: open discovery, never the closed or the ones you disliked.
 for(const place of placeById.values()){
  if(savedPlaceIds.has(place.id)||!hasCoords(place)||isSuppressedVenue(place, now))continue;
  const facts=placeFacts(place, false);if(!facts)continue;
  let score=facts.score;
  if(!historyOf(place)&&visits.size)score+=5;
  const reasons=facts.reasons.length?facts.reasons:[kindText(place)].filter(Boolean);
  candidates.push({key:`place:${place.id}`, raw:place.id, kind:'place', place, score, reasons, group:facts.group});
 }

 // Seeded jitter (0-4 points) breaks near-ties so "Three more" feels fresh,
 // but never lifts a place above a save (saves start 100 points ahead).
 for(const c of candidates)c.score=Math.round((c.score+unit(seed,c.key)*4)*100)/100;
 const rank=(a,b)=>b.score-a.score||a.key.localeCompare(b.key);
 candidates.sort(rank);

 const excluded=new Set((exclude||[]).map(String));
 const isExcluded=c=>excluded.has(c.key)||excluded.has(String(c.raw));
 const fresh=candidates.filter(c=>!isExcluded(c));
 const want=Math.min(3,candidates.length);
 const chosen=choose(fresh, want);
 const wrapped=chosen.length<want;
 if(wrapped)chosen.push(...choose(candidates.filter(c=>isExcluded(c)), want-chosen.length, chosen));
 const picks=chosen.map(({key,kind,save,place,event,score,reasons})=>({id:key, kind, ...(save?{save}:{}), ...(place?{place}:{}), ...(event?{event}:{}), score, reasons:reasons.slice(0,3)}));

 if(passed)notes.push(`${passed} save${passed===1?' has':'s have'} passed ${passed===1?'its':'their'} date and ${passed===1?'was':'were'} left out (still in your saves).`);
 if(tooFar)notes.push(`${tooFar} option${tooFar===1?' is':'s are'} beyond your distance limit.`);
 if(unlocatedOut)notes.push(`${unlocatedOut} event${unlocatedOut===1?' has':'s have'} no map location, so ${unlocatedOut===1?'it was':'they were'} left out under your distance limit.`);
 if(unlocated&&picks.some(p=>p.kind==='event'&&!p.reasons.some(r=>/ away$/.test(r))))notes.push('Some events have no map location, so their distance is unknown.');
 const summary=!candidates.length?'Nothing fits tonight yet. Save a few things or widen the distance.':
  wrapped?`You've seen all ${candidates.length} options, so these start over from the top.`:
  `${picks.length} of ${candidates.length} option${candidates.length===1?'':'s'} for tonight.`;
 return {picks, pool:candidates.length, explain:{summary, wrapped, notes}};
}

// Greedy variety: each repeat of a group costs 12 points and each repeat of a
// kind 6, so three bars only happen when nothing else comes close.
function choose(list, count, already=[]){
 const pool=[...list], out=[];
 const groups=new Map(), kinds=new Map();
 for(const c of already){groups.set(c.group,(groups.get(c.group)||0)+1);kinds.set(c.kind,(kinds.get(c.kind)||0)+1);}
 while(out.length<count&&pool.length){
  let best=0, bestScore=-Infinity;
  for(let i=0;i<pool.length;i++){
   const c=pool[i], s=c.score-12*(groups.get(c.group)||0)-6*(kinds.get(c.kind)||0);
   if(s>bestScore||(s===bestScore&&c.key<pool[best].key)){best=i;bestScore=s;}
  }
  const [next]=pool.splice(best,1);out.push(next);
  groups.set(next.group,(groups.get(next.group)||0)+1);kinds.set(next.kind,(kinds.get(next.kind)||0)+1);
 }
 return out;
}
