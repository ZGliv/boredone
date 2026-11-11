import corrections from './data/venue-corrections.json' with {type:'json'};
const nameKey=s=>String(s).toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]/g,'');
// Discovery-only exclusions. Saved plans and memories are never removed or rewritten.
export function isSuppressedVenue(place, now=Date.now()){
 return corrections.some(row=>(!row.expiresAt || now < Date.parse(row.expiresAt)) && row.names.some(name=>nameKey(name)===nameKey(place.name)) && Math.abs(place.lat-row.lat)<.003 && Math.abs(place.lng-row.lng)<.003);
}
