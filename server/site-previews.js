import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
// Explicit maintainer tooling only. No public arbitrary-URL fetch/proxy endpoint.
export function publicAddress(ip){
 if(isIP(ip)===4){const [a,b]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19));}
 return isIP(ip)===6 && !/^(::|fc|fd|fe[89ab]|ff)/i.test(ip);
}
export function previewUrl(raw,base){if(!raw?.trim())return '';try{const u=new URL(raw,base);if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||u.hostname==='localhost'||u.hostname.endsWith('.local')||isIP(u.hostname.replace(/[\[\]]/g,'')))return '';return u.href;}catch{return '';}}
export async function fetchPublicPage(raw,{maxBytes=2000000,timeout=10000,redirects=3,headOnly=false,truncate=false}={}){
 const url=new URL(previewUrl(raw)||(()=>{throw Error('Only public HTTPS pages are supported');})());
 const addresses=await lookup(url.hostname,{all:true});if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('Non-public host');
 const chosen=addresses[0];
 return new Promise((resolve,reject)=>{
  const request=https.get(url,{headers:{'User-Agent':'BordonePreview/1.0 (+https://boredone.vercel.app)','Accept':'text/html,application/xhtml+xml'},lookup:(_host,options,done)=>options?.all?done(null,[chosen]):done(null,chosen.address,chosen.family)},response=>{
   if([301,302,303,307,308].includes(response.statusCode)){response.resume();if(redirects<=0)return reject(Error('Too many redirects'));const next=previewUrl(response.headers.location,url);if(!next)return reject(Error('Unsafe redirect'));fetchPublicPage(next,{maxBytes,timeout,redirects:redirects-1,headOnly,truncate}).then(resolve,reject);return;}
   if(response.statusCode!==200){response.resume();return reject(Error(`HTTP ${response.statusCode}`));}
   let size=0;const chunks=[];response.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){if(truncate){resolve({url:url.href,html:Buffer.concat(chunks).toString('utf8'),type:response.headers['content-type']||''});response.destroy();}else request.destroy(Error('Page exceeds size limit'));}else {chunks.push(chunk);if(headOnly&&Buffer.concat(chunks).toString('utf8').includes('</head>')){resolve({url:url.href,html:Buffer.concat(chunks).toString('utf8').split('</head>')[0]+'</head>',type:response.headers['content-type']||''});response.destroy();}}});response.on('end',()=>resolve({url:url.href,html:Buffer.concat(chunks).toString('utf8'),type:response.headers['content-type']||''}));response.on('error',reject);
  });
  const deadline=setTimeout(()=>request.destroy(Error('Website timed out')),timeout);request.on('close',()=>clearTimeout(deadline));request.on('error',reject);
 });
}
const decode=s=>String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(Number(n),0x10ffff))).replace(/<[^>]*>/g,'').trim();
const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m=>[m[1].toLowerCase(),decode(m[2]??m[3]??m[4])]));
const key=s=>decode(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\bbros\b/g,'brothers').replace(/\b(the|restaurant|cafe|bar|and|co|inc|llc|grill)\b/g,'').replace(/[^a-z0-9]/g,'');
export function extractWebsitePreview(html,pageUrl,venue){
 const tags=[...html.matchAll(/<meta\b[^>]*>/gi)].map(m=>attrs(m[0]));const meta=name=>tags.find(t=>(t.property||t.name)?.toLowerCase()===name)?.content||'';
 const title=decode(meta('og:title')||html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'');
 const venueKey=key(venue.name),pageKey=key(title+' '+meta('og:site_name'));
 const leading=key(venue.name.split(/\s+/)[0]);
 if(venueKey.length<3||!(pageKey.includes(venueKey)||(leading.length>=6&&pageKey.includes(leading))))return {reason:'Website identity needs review',title};
 if(/domain (for sale|expired)|buy this domain|website suspended|permanently closed|casino|slot online|togel|jackpot|viagra|betting|arisantoto/i.test(title+' '+meta('og:description')))return {reason:'Unavailable business website',title};
 if(/noimageindex|nosnippet/i.test(meta('robots')))return {reason:'Website opts out of previews',title};
 const choices=[meta('og:image:secure_url'),meta('og:image'),meta('twitter:image'),meta('twitter:image:src'),...pagePhotoCandidates(html,pageUrl)];
 const candidates=[...new Set(choices.map(x=>previewUrl(x,pageUrl)).filter(x=>x&&!/logo|favicon|placeholder|icon-|\.svg(?:\?|$)|default[-_]?social|transparent/i.test(x)))];
 if(!candidates.length)return {reason:'No photographic sharing image',title};
 return {title,candidates,photo:{url:candidates[0],sourceUrl:pageUrl,author:venue.name,kind:'website-preview',offline:false,license:null,cropped:true,retrievedAt:new Date().toISOString()},website:pageUrl};
}
export function robotsAllows(text,path,userAgent='BordonePreview'){
 const groups=[];let agents=[],rules=[],hasRules=false;
 function save(){if(agents.length)groups.push({agents,rules});agents=[];rules=[];hasRules=false;}
 for(const raw of text.split(/\r?\n/)){const line=raw.replace(/#.*/,'').trim(),m=line.match(/^([^:]+):\s*(.*)$/);if(!m)continue;const label=m[1].toLowerCase(),value=m[2].trim();if(label==='user-agent'){if(hasRules)save();agents.push(value.toLowerCase());}else if(['allow','disallow'].includes(label)&&agents.length){hasRules=true;if(value)rules.push({allow:label==='allow',value});}}
 save();const specific=groups.filter(g=>g.agents.some(a=>a!=='*'&&userAgent.toLowerCase().includes(a))),active=specific.length?specific:groups.filter(g=>g.agents.includes('*'));
 const applicable=active.flatMap(g=>g.rules).filter(r=>{const escaped=r.value.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replaceAll('*','.*');return new RegExp('^'+escaped).test(path);}).sort((a,b)=>b.value.length-a.value.length||Number(b.allow)-Number(a.allow));return applicable[0]?.allow??true;
}
export function pagePhotoCandidates(html,pageUrl){
 const candidates=[];
 const add=value=>{const url=previewUrl(typeof value==='string'?value:value?.url||value?.contentUrl,pageUrl);if(url&&!/logo|favicon|placeholder|icon[-_]|\.svg(?:\?|$)|badge|award|tracking|pixel|payment|social[-_]?icon|powered|spacer/i.test(url))candidates.push(url);};
 for(const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))try{const walk=(obj,depth=0)=>{if(!obj||depth>8)return;if(Array.isArray(obj)){obj.forEach(x=>walk(x,depth+1));return;}if(typeof obj==='object'){if(obj.image){(Array.isArray(obj.image)?obj.image:[obj.image]).forEach(add);}for(const [k,v]of Object.entries(obj))if(k!=='logo')walk(v,depth+1);}};walk(JSON.parse(match[1]));}catch{}
 for(const match of html.matchAll(/<img\b[^>]*>/gi)){const a=attrs(match[0]);if(/logo|icon|badge|award|map|avatar|social|sponsor|powered/i.test((a.alt||'')+' '+(a.class||'')))continue;if(a.width&&Number(a.width)<250)continue;if(a.height&&Number(a.height)<120)continue;add(a['data-src']||a.src);}
 return [...new Set(candidates)].slice(0,8);
}

// Broader candidate extraction for the explicit gallery audit, never auto-published.
export function galleryPhotoCandidates(html,pageUrl){
 if([...html.matchAll(/<meta\b[^>]*>/gi)].map(m=>attrs(m[0])).some(a=>(a.name||'').toLowerCase()==='robots'&&/noimageindex|nosnippet/i.test(a.content||'')))return [];
 const candidates=[...pagePhotoCandidates(html,pageUrl)];
 const add=raw=>{const url=previewUrl(decode(decode(raw)).replace(/^['"]|['"]$/g,''),pageUrl);if(url&&!/logo|favicon|icon|badge|award|placeholder|spinner|pattern|sprite|stock|gravatar|avatar|sponsor|transparent|dummy|widget|tracking|pixel|facebook\.com\/tr(?:\?|$)|footer-graphics|accepted-cards|\/gfonts\/|\.(?:svg|woff2?|ttf|otf|css|js)(?:\?|$)/i.test(url))candidates.push(url.replace(/(static\.wixstatic\.com\/media\/[^/]+)\/v1\/.*/,'$1'));};
 // Square storefronts embed banner and background image sources in JSON with escaped slashes.
 // These remain review-only candidates, subject to the same URL and opt-out checks.
 for(const m of html.matchAll(/"(?:bannerImage|background)"\s*:\s*\{[^}]{0,300}?"image"\s*:\s*\{[^}]{0,2500}?"source"\s*:\s*"((?:\\.|[^"\\])*)"/gi)){
  try{const source=JSON.parse('"'+m[1]+'"');if(source.startsWith('/uploads/b/'))add(source);}catch{}
 }
 for(const m of html.replaceAll('&quot;','"').replaceAll('&#39;',"'").matchAll(/url\(\s*['"]?([^'"\s)<>]+)['"]?\s*\)/gi))add(m[1]);
 for(const m of html.matchAll(/<(?:img|source)\b[^>]*>/gi)){const a=attrs(m[0]);if(/logo|icon|badge|avatar|sponsor/i.test((a.alt||'')+' '+(a.class||'')))continue;
  for(const k of ['data-src','src','data-image','data-bg'])if(a[k])add(a[k]);
  const set=a['data-srcset']||a.srcset;if(set){const sizes=set.split(/,\s*(?=https?:\/\/|\/)/).map(s=>({url:s.trim().replace(/\s+[\d.]+[wx]\s*$/,''),size:Number(s.match(/\s+([\d.]+)[wx]\s*$/)?.[1]||0)})).sort((a,b)=>b.size-a.size);if(sizes[0])add(sizes[0].url);}
 }

 return [...new Set(candidates)].filter(x=>!/%26quot;|&quot;|accepted-cards|facebook\.com\/tr(?:\?|$)|tracking|pixel|\/gfonts\/|\.(?:woff2?|ttf|otf|css|js)(?:\?|$)/i.test(x)).slice(0,32);
}
