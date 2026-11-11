import {createHash} from 'node:crypto';
import {distanceKm, searchInput, safeUrl} from './discovery.js';
const UA='Bordone/0.5 (personal outing discovery; https://boredone.vercel.app)';
const LICENSE='https://creativecommons.org/licenses/by-sa/4.0/';
export function plain(text='') {
 return String(text).replace(/<!--[\s\S]*?-->/g,'').replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi,'').replace(/<[^>]*>/g,'').replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g,'$2').replace(/\[\[([^\]]+)\]\]/g,'$1').replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g,'$1').replace(/\{\{[^{}]*\}\}/g,'').replace(/'{2,}/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
}
const nameKey=value=>plain(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\bbros\b/g,'brothers').replace(/\b(the|restaurant|bar|and)\b/g,'').replace(/[^a-z0-9]/g,'');
function fields(body) {
 let level=0, links=0, start=0; const parts=[];
 for(let i=0;i<body.length;i++) { const pair=body.slice(i,i+2); if(pair==='{{'){level++;i++;}else if(pair==='}}'){level--;i++;}else if(pair==='[['){links++;i++;}else if(pair===']]'){links--;i++;}else if(body[i]==='|' && !level && !links){parts.push(body.slice(start,i));start=i+1;} }
 parts.push(body.slice(start)); return Object.fromEntries(parts.slice(1).map(p=>{const i=p.indexOf('=');return i<0?['','']:[p.slice(0,i).trim().toLowerCase(),p.slice(i+1).trim()];}));
}
export function parseListings(text, page, input, fetchedAt) {
 const records=[], rx=/\{\{\s*(eat|drink)\s*(?=\||\n)/gi; let match;
 const files=[...text.matchAll(/\[\[(?:File|Image):([^\]|]+)([^\]]*)\]\]/gi)].map(m=>({file:m[1].trim(),caption:plain(m[2].split('|').at(-1))}));
 while((match=rx.exec(text))) {
  let depth=1, end=rx.lastIndex;
  for(;end<text.length-1;end++){const pair=text.slice(end,end+2);if(pair==='{{'){depth++;end++;}else if(pair==='}}'){depth--;if(!depth)break;end++;}}
  if(depth)continue;
  const f=fields(text.slice(match.index+2,end)), name=plain(f.name),lat=Number(f.lat),lng=Number(f.long??f.lon);
  if(!name || !f.lat || !(f.long||f.lon) || !Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>85||Math.abs(lng)>180||distanceKm(input,{lat,lng})>input.radius/1000)continue;
  const description=plain(f.content);
  if(/permanently closed|has closed|now closed|closed down|defunct/i.test(description))continue;
  const key=nameKey(name);
  const file=f.image || files.find(x=>key.length>5 && (nameKey(x.file).includes(key)||nameKey(x.caption)===key))?.file;
  const id='wv-'+createHash('sha256').update(`${page.pageid}:${key}:${lat.toFixed(5)}:${lng.toFixed(5)}`).digest('hex').slice(0,20);
  const pageUrl=`https://en.wikivoyage.org/w/index.php?title=${encodeURIComponent(page.title)}&oldid=${page.revid}`;
  records.push({id,name:name.slice(0,180),lat,lng,category:match[1].toLowerCase()==='eat'?'restaurant':/coffee|cafe|café|tea\b/i.test(name)?'cafe':'bar',address:plain(f.address).slice(0,600),website:safeUrl(f.url),source:'Wikivoyage contributors',sourceUrl:pageUrl,hours:'',fee:'',access:'',distanceKm:Math.round(distanceKm(input,{lat,lng})*10)/10,
   recommendation:{text:description.slice(0,420),source:'Wikivoyage contributors',sourceUrl:pageUrl,license:LICENSE,page:page.title,listingUpdated:/^\d{4}-\d{2}-\d{2}$/.test(f.lastedit||'')?f.lastedit:null,retrievedAt:fetchedAt,excerpt:true},photoFile:file||null,wikidata:/^Q\d+$/.test(f.wikidata||'')?f.wikidata:null});
  rx.lastIndex=end+2;
 }
 return records;
}
export function normalizePhoto(page) {
 const info=page.imageinfo?.[0], meta=info?.extmetadata;if(!info||!meta)return null;
 const license=plain(meta.LicenseShortName?.value),licenseUrl=safeUrl(meta.LicenseUrl?.value),author=plain(meta.Artist?.value||meta.Credit?.value);
 if(!/^(CC BY|CC0|Public domain)/i.test(license)||!author)return null;
 const url=safeUrl(info.thumburl||info.url);if(!url||!['upload.wikimedia.org','thumb.wikimedia.org'].includes(new URL(url).hostname))return null;
 return {url,sourceUrl:safeUrl(info.descriptionurl),author:author.slice(0,300),license,licenseUrl:licenseUrl||'https://commons.wikimedia.org/wiki/Commons:Copyright_tags',title:plain(page.title).replace(/^File:/,''),cropped:true};
}
export function createEditorialService({fetcher=fetch,clock=Date.now}={}) {
 const cache=new Map(),pending=new Map();
 async function query(host,params,signal) {
  const url=new URL(`https://${host}/w/api.php`);url.search=new URLSearchParams({...params,format:'json',maxlag:'5'});
  const response=await fetcher(url,{signal,headers:{'User-Agent':UA}});if(!response.ok)throw Error('Guide source unavailable');
  const data=await response.json();if(data.error)throw Error('Guide source unavailable');return data;
 }
 async function load(input,signal) {
  const fetchedAt=new Date(clock()).toISOString();
  const getPage=async title=>(await query('en.wikivoyage.org',{action:'parse',page:title,prop:'wikitext|links|revid'},signal)).parse;
  const root=await getPage(input.city);
  const children=(root.links||[]).filter(p=>p.ns===0&&p['*']?.startsWith(root.title+'/')).slice(0,8);
  const pages=[root];let partial=false;
  // Two at a time, no recursive crawling beyond the selected city's districts.
  for(let i=0;i<children.length;i+=2){const rows=await Promise.allSettled(children.slice(i,i+2).map(p=>getPage(p['*'])));for(const row of rows){if(row.status==='fulfilled')pages.push(row.value);else partial=true;}}
  const byId=new Map();for(const page of pages)for(const p of parseListings(page.wikitext?.['*']||'',page,input,fetchedAt))if(![...byId.values()].some(q=>nameKey(q.name)===nameKey(p.name)&&distanceKm(q,p)<.1))byId.set(p.id,p);
  const places=[...byId.values()].sort((a,b)=>Number(!!b.recommendation.text)-Number(!!a.recommendation.text)||a.distanceKm-b.distanceKm).slice(0,60);
  const entityPlaces=places.filter(p=>!p.photoFile&&p.wikidata).slice(0,12);
  if(entityPlaces.length)try{const data=await query('www.wikidata.org',{action:'wbgetentities',ids:entityPlaces.map(p=>p.wikidata).join('|'),props:'claims'},signal);for(const p of entityPlaces)p.photoFile=data.entities?.[p.wikidata]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value||null;}catch{partial=true;}
  // Geotagged images must also name the venue. A nearby generic photo is never used.
  const missing=places.filter(p=>!p.photoFile && p.recommendation.text).slice(0,8);
  for(let i=0;i<missing.length;i+=2) await Promise.all(missing.slice(i,i+2).map(async p=>{
    try { const data=await query('commons.wikimedia.org',{action:'query',list:'geosearch',gscoord:`${p.lat}|${p.lng}`,gsradius:'100',gslimit:'50',gsnamespace:'6'},signal);
      const hit=(data.query?.geosearch||[]).find(f=>nameKey(p.name).length>5 && nameKey(f.title).includes(nameKey(p.name)) && distanceKm(p,{lat:f.lat,lng:f.lon})<=.1);
      if(hit)p.photoFile=hit.title.replace(/^File:/,'');
    }catch{partial=true;}
  }));
  const files=[...new Set(places.map(p=>p.photoFile).filter(Boolean))].slice(0,12);
  if(files.length)try{const data=await query('commons.wikimedia.org',{action:'query',titles:files.map(f=>'File:'+f.replace(/^File:/,'')).join('|'),prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'640'},signal);const photos=new Map(Object.values(data.query?.pages||{}).map(p=>[p.title.replace(/^File:/,'').replaceAll('_',' '),normalizePhoto(p)]));for(const p of places)p.photo=photos.get((p.photoFile||'').replace(/^File:/,'').replaceAll('_',' '))||null;}catch{partial=true;}
  return {places:places.map(({photoFile,wikidata,...p})=>p),fetchedAt,providerName:'Wikivoyage + Wikimedia Commons',license:LICENSE,partial,pages:pages.map(p=>({title:p.title,revision:p.revid})),center:{lat:input.lat,lng:input.lng},radius:input.radius,city:input.city};
 }
 return async input=>{
  const key=JSON.stringify(input), saved=cache.get(key);if(saved&&clock()-Date.parse(saved.fetchedAt)<86400000)return saved;
  if(pending.has(key))return pending.get(key);
  if(pending.size>=2)throw Error('Guide source busy');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
  const task=load(input,controller.signal).then(data=>{if(!data.partial){cache.set(key,data);while(cache.size>12)cache.delete(cache.keys().next().value);}return data;}).finally(()=>{clearTimeout(timer);pending.delete(key);});pending.set(key,task);return task;
 };
}
const service=createEditorialService();
export async function editorialHandler(req,res){
 res.setHeader('Content-Type','application/json');
 if(req.method!=='GET'){res.statusCode=405;res.setHeader('Allow','GET');res.end(JSON.stringify({error:'Use GET'}));return;}
 try{const params=new URL(req.url,'http://localhost').searchParams;const input=searchInput(params),city=params.get('city')?.trim();if(!city||city.length>100||/[#|{}\[\]<>/]/.test(city))throw Error('Choose a valid city');const data=await service({...input,city});res.setHeader('Cache-Control',data.partial?'no-store':'public, max-age=300, s-maxage=86400');res.end(JSON.stringify(data));}catch{res.statusCode=503;res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error:'Editorial guide unavailable. Your saved places are still available.'}));}
}
