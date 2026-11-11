import {isSuppressedVenue} from './venueCorrections.js';
import {venueGroup} from './venues.js';
export function distance(a,b){const r=Math.PI/180,dlat=(b.lat-a.lat)*r,dlng=(b.lng-a.lng)*r;const h=Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlng/2)**2;return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
const key=name=>String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\bbros\b/g,'brothers').replace(/\b(the|restaurant|bar|and|co)\b/g,'').replace(/[^a-z0-9]/g,'');
export function mergeEditorial(base, editorial){
 const places=base.map(p=>({...p}));
 for(const rec of editorial||[]){
  const same=places.filter(p=>p.id===rec.id || (key(p.name)===key(rec.name)&&distance(p,rec)<.12));
  // Ambiguous branches are not merged; stable provider IDs remain intact.
  const found=places.find(p=>p.id===rec.id)||(same.length===1?same[0]:null);
  if(found){found.recommendation=rec.recommendation||found.recommendation;found.photo=found.photo?.url?.startsWith('/guide-photos/') ? found.photo : rec.photo||found.photo;found.websiteBlocked=rec.websiteBlocked||found.websiteBlocked;found.website=found.websiteBlocked?'':rec.website||found.website;found.websitePhoto=found.websiteBlocked?undefined:rec.websitePhoto||found.websitePhoto;found.cuisine=rec.cuisine||found.cuisine;found.address=found.address||rec.address;}
  else if(!places.some(p=>p.id===rec.id))places.push({...rec});
 }
 // Keep editorial candidates when capping the public cache, without mutating saves.
 return [...places.filter(p=>p.recommendation),...places.filter(p=>!p.recommendation)].filter(p=>!isSuppressedVenue(p)).slice(0,800);
}
// This is source-age evidence, not a claim that a venue is currently open.
export function editorialFreshness(recommendation, now=Date.now()) {
 const date=recommendation?.listingUpdated;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return 'unknown';
 const timestamp=Date.parse(date);
 if(!Number.isFinite(timestamp)||new Date(timestamp).toISOString().slice(0,10)!==date||timestamp>now)return 'unknown';
 return now-timestamp<=2*365*86400000?'dated':'old';
}
export function rankRecommendations(items,outings=[],now=Date.now()){
 const liked=new Set(outings.filter(o=>o.status==='visited'&&o.rating>=4).map(o=>venueGroup(o.place.category)).filter(Boolean));
 const remaining=items.map(item=>{
  const p=item.place, own=outings.filter(o=>o.place.id===p.id),latest=own.filter(o=>o.status==='visited').sort((a,b)=>(b.visitDate||'').localeCompare(a.visitDate||''))[0];
  const freshness=editorialFreshness(p.recommendation,now);
  let score=p.recommendation?.text?(freshness==='dated'?18:freshness==='unknown'?4:0):0;const reasons=[];
  if(p.recommendation?.text)reasons.push(freshness==='dated'?`Guide entry updated ${p.recommendation.listingUpdated}`:freshness==='old'?'Older guide entry':'Guide entry · date unknown');
  if(liked.has(venueGroup(p.category))){score+=5;reasons.push('Matches a type of outing you rated highly');}
  if(latest?.rating>=4){score+=24;reasons.unshift(`You rated it ${latest.rating}/5`);}else if(latest?.rating>0&&latest.rating<=2){score-=60;reasons.unshift(`You rated it ${latest.rating}/5`);}
  if(own.some(o=>o.status==='planned')){score+=8;reasons.push('Already in your plans');}
  score-=Math.min(p.distanceKm||0,5);if(p.photo||p.websitePhoto)score+=2;
  return {...item,score,why:reasons.slice(0,2)};
 });
 // Cache categories and select the next best score in one pass. Re-sorting
 // the entire list on every pick repeated expensive category normalization.
 // Compute the same adjusted score/id comparison, including floating ties.
 const groups=new Map(remaining.map(item=>[item.place.id,venueGroup(item.place.category)]));
 const counts=new Map(),result=[];
 while(remaining.length){
  let best=0,bestScore=-Infinity;
  for(let i=0;i<remaining.length;i++){
   const item=remaining[i],score=item.score-3*(counts.get(groups.get(item.place.id))||0);
   if(score>bestScore||(score===bestScore&&item.place.id.localeCompare(remaining[best].place.id)<0)){best=i;bestScore=score;}
  }
  const [next]=remaining.splice(best,1),group=groups.get(next.place.id);
  counts.set(group,(counts.get(group)||0)+1);result.push(next);
 }
 return result;
}
