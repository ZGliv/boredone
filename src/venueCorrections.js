import corrections from './data/venue-corrections.json' with {type:'json'};
const nameKey=s=>String(s).toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]/g,'');
// Discovery-only exclusions. Saved plans and memories are never removed or rewritten.
// Keys and expiry parsed once: this runs for every place on every Tonight pick.
const ROWS=corrections.map(row=>({...row, keys:new Set(row.names.map(nameKey)), until:row.expiresAt?Date.parse(row.expiresAt):Infinity}));
export function isSuppressedVenue(place, now=Date.now()){
 let key=null;
 for(const row of ROWS){
  if(!(Math.abs(place.lat-row.lat)<.003&&Math.abs(place.lng-row.lng)<.003)||!(now<row.until))continue;
  key??=nameKey(place.name);
  if(row.keys.has(key))return true;
 }
 return false;
}
