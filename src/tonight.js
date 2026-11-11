// Ephemeral shortlist; deliberately separate from the permanent journal.
export const TONIGHT_KEY='boredone-tonight-v1';
export const MAX_TONIGHT=50;
export function tonightReset(now=new Date()){
 const reset=new Date(now);reset.setHours(5,0,0,0);
 if(reset<=now)reset.setDate(reset.getDate()+1);
 return reset.getTime();
}
export function readTonight(storage,now=new Date()){
 const empty={expiresAt:tonightReset(now),places:[]};
 try{
  const saved=JSON.parse(storage.getItem(TONIGHT_KEY));
  if(!saved||!Number.isFinite(saved.expiresAt)||saved.expiresAt<=now.getTime()||!Array.isArray(saved.places))return empty;
  const seen=new Set();
  return {expiresAt:saved.expiresAt,places:saved.places.filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&p.name&&!seen.has(p.id)&&seen.add(p.id)).slice(0,MAX_TONIGHT)};
 }catch{return empty;}
}
export function toggleTonight(storage,place,now=new Date()){
 const state=readTonight(storage,now),exists=state.places.some(p=>p.id===place.id);
 if(!exists&&state.places.length>=MAX_TONIGHT)throw Error('Tonight is full. Remove a place before adding another.');
 const next={...state,places:exists?state.places.filter(p=>p.id!==place.id):[...state.places,place]};
 storage.setItem(TONIGHT_KEY,JSON.stringify(next));
 return next;
}
