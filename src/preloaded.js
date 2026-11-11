import corridor from './data/south-hills-corridor.json' with {type:'json'};
import websites from './data/pittsburgh-websites.json' with {type:'json'};
import editorial from './data/pittsburgh-editorial.json' with { type: 'json' };
import {mergeEditorial} from './recommendations.js';
import guide from './data/pittsburgh.json' with { type: 'json' };
export const DEFAULT_AREA = {name:'Pittsburgh',label:'Pittsburgh, Pennsylvania, US',lat:40.44062,lng:-79.99589};
export const CORRIDOR_AREA = {name:'15317 to Pittsburgh',label:'Southpointe, South Hills and Pittsburgh',lat:40.3515,lng:-80.1101,corridor:true};
const BUNDLE_REVISION = 'venue-websites-143';
export function preloadedDiscovery(saved) {
  if (saved) {
    const updated = bundledArea(saved.area, saved.result.bundled ? guide.radius : saved.result.radius);
    return updated && saved.result.bundleRevision !== BUNDLE_REVISION ? {...saved, result:updated} : saved;
  }
  return {area: DEFAULT_AREA, result: bundledArea(DEFAULT_AREA)};
}
export function bundledArea(area, radius = guide.radius) {
  if(area.corridor && Number(radius)===5000){
    const downtown=mergeEditorial(mergeEditorial(guide.places,editorial.places),websites.places).filter(p=>p.distanceKm<=1.5).sort((a,b)=>Number(!!(b.websitePhoto||b.photo))-Number(!!(a.websitePhoto||a.photo))).slice(0,150);
    const places=[...new Map([...corridor.places,...downtown].map(p=>[p.id,p])).values()].map(p=>({...p,distanceKm:distanceFromCorridorCenter(p)}));
    return {...guide,center:{lat:40.35,lng:-80.11},cityName:area.name,cityLabel:area.label,radius:5000,places,bundled:true,corridor:true,bundleRevision:BUNDLE_REVISION,stale:true};
  }
  if(![3000,5000].includes(Number(radius)) || Math.round(area.lat * 100) / 100 !== guide.center.lat || Math.round(area.lng * 100) / 100 !== guide.center.lng)return null;
  return {...guide, radius:Number(radius), places:mergeEditorial(mergeEditorial(guide.places,editorial.places),websites.places).filter(p=>p.distanceKm<=Number(radius)/1000), editorialAt:editorial.fetchedAt, bundleRevision:BUNDLE_REVISION, stale:true};
}

export function enrichBundledArea(area,result){
 const bundled=bundledArea(area,result.radius);
 return bundled ? {...result,places:mergeEditorial(result.places,bundled.places),bundled:true,bundleRevision:BUNDLE_REVISION,editorialAt:bundled.editorialAt,bundledSourceUpdatedAt:guide.sourceUpdatedAt} : result;
}

function distanceFromCorridorCenter(p){const r=Math.PI/180,lat=40.3515,lon=-80.1101;const h=Math.sin((p.lat-lat)*r/2)**2+Math.cos(lat*r)*Math.cos(p.lat*r)*Math.sin((p.lng-lon)*r/2)**2;return Math.round(12742*Math.asin(Math.sqrt(h))*10)/10;}
