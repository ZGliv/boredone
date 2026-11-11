import {normalizePhoto,plain} from './editorial.js';
import {distanceKm} from './discovery.js';
const key=s=>plain(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/['’]/g,'').replace(/\bbros\b/g,'brothers').replace(/\b(the|and)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
export function matchVenuePhoto(place, pages, venues, city){
 const name=key(place.name);if(name.length<5||['images','library','station','social','market','union'].includes(name))return null;
 const branches=venues.filter(v=>key(v.name)===name);
 const candidates=pages.flatMap(page=>{
  const info=page.imageinfo?.[0],meta=info?.extmetadata,photo=normalizePhoto(page);if(!photo||!/\.(jpe?g|png|webp)$/i.test(page.title))return [];
  const title=key(page.title.replace(/^File:/,'')),description=key(meta?.ImageDescription?.value||'');
  const hasName=t=>(` ${t} `).includes(` ${name} `) || (name.replaceAll(' ','').length>=10 && t.replaceAll(' ','').includes(name.replaceAll(' ','')));
  if(!hasName(title)&&!hasName(description))return [];
  if(/^file:(image from page|page|report|catalog)/i.test(page.title))return [];
  const coords=page.coordinates?.[0];
  // Multiple branches require a geotag. Without one, both venue name and city must be explicit.
  const near=coords&&distanceKm(place,{lat:coords.lat,lng:coords.lon})<=.15;
  if(coords&&!near)return [];
  if(!hasName(title)&&!near)return [];
  if(!near&&(/eatn park|starbucks|mcdonalds|dunkin|primanti|pamelas diner/.test(name)||branches.length!==1||!(hasCity(title+' '+description,city)||page.sourceCity===city)))return [];
  if(/\b(demolished|former|closed|abandoned)\b/.test(description))return [];
  return [{...photo,match:near?'venue name + coordinates':'unique venue name + city',capturedAt:plain(meta?.DateTimeOriginal?.value||''),_score:(near?10:0)+(hasName(title)?5:0)}];
 });
 candidates.sort((a,b)=>b._score-a._score||a.title.localeCompare(b.title));
 if(!candidates.length)return null;const {_score,...photo}=candidates[0];return photo;
}
function hasCity(text,city){return (` ${text} `).includes(` ${key(city)} `);}
// Explicit city-index refresh. No browser-triggered scraping or paid API calls.
export async function collectCommonsPhotos(city,{fetcher=fetch,maxPages=8,signal,seedPages=[]}={}){
 if(!/^[\p{L}\p{N} .'-]{1,100}$/u.test(city))throw Error('Invalid city');
 const pages=new Map(seedPages.map(p=>[p.pageid,p])),failures=[];
 const searches=[`deepcat:"Restaurants in ${city}"`,`deepcat:"Bars in ${city}"`,`"${city}" "restaurant" filetype:bitmap`,`"${city}" "bar" filetype:bitmap`,`"${city}" "brewery" filetype:bitmap`,`"${city}" "cafe" filetype:bitmap`,`"${city}" "diner" filetype:bitmap`,`"${city}" "coffee" filetype:bitmap`];
 for(const search of searches.slice(0,Math.min(maxPages,8))){
  try {
  const url=new URL('https://commons.wikimedia.org/w/api.php');
  url.search=new URLSearchParams({action:'query',generator:'search',gsrsearch:search,gsrnamespace:'6',gsrlimit:'50',prop:'imageinfo|coordinates',colimit:'max',iiprop:'url|extmetadata',iiurlwidth:'640',format:'json',maxlag:'5'});
  const response=await fetcher(url,{signal:signal||AbortSignal.timeout(25000),headers:{'User-Agent':'Bordone/0.6 (licensed city photo index; https://boredone.vercel.app)'}});
  if(!response.ok)throw Error(`Commons source unavailable (${response.status})`);
  const data=await response.json();if(data.error)throw Error(data.error.info||'Commons source unavailable');
  for(const p of Object.values(data.query?.pages||{})){if(search.startsWith('deepcat:'))p.sourceCity=city;pages.set(p.pageid,{...pages.get(p.pageid),...p});}
  } catch(error){failures.push({search,error:error.message});}
 }
 return {pages:[...pages.values()],failures};
}
