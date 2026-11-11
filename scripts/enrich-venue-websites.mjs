// Bounded metadata refresh for existing node/way identities, never a map crawl.
import{readFile,writeFile}from'node:fs/promises';import{distanceKm,safeUrl}from'../server/discovery.js';
const[input,output]=process.argv.slice(2);if(!output)throw Error('Provide input.json output.json');const source=JSON.parse(await readFile(input));
const key=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const candidates=source.places.filter(p=>/^ofm-\d+1-/.test(p.id)).slice(0,700),elements=[];
for(let i=0;i<candidates.length;i+=100){const ids=candidates.slice(i,i+100).map(p=>Math.floor(Number(p.id.split('-')[1])/10));const response=await fetch('https://api.openstreetmap.org/api/0.6/nodes.json?nodes='+ids.join(','),{headers:{'User-Agent':'Bordone/0.7 (explicit venue website verification; https://boredone.vercel.app)'},signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('OSM metadata unavailable: '+response.status);elements.push(...(await response.json()).elements);}
let matched=0;for(const p of candidates){const id=Math.floor(Number(p.id.split('-')[1])/10),node=elements.find(e=>e.id===id),t=node?.tags||{};
 if(!node||key(t.name)!==key(p.name)||distanceKm(p,{lat:node.lat,lng:node.lon})>.1)continue;
 const website=safeUrl(t.website||t['contact:website']);if(website){p.website=website;p.websiteEvidence={sourceUrl:`https://www.openstreetmap.org/node/${id}`,checkedAt:new Date().toISOString()};matched++;}
 if(!p.address)p.address=[t['addr:housenumber'],t['addr:street']].filter(Boolean).join(' ');
 if(t.cuisine)p.cuisine=t.cuisine;
}
const picks=source.places.filter(p=>/^ofm-\d+2-/.test(p.id)).slice(0,700),ways=[];
for(let i=0;i<picks.length;i+=100){const ids=picks.slice(i,i+100).map(p=>Math.floor(Number(p.id.split('-')[1])/10));const r=await fetch('https://api.openstreetmap.org/api/0.6/ways.json?ways='+ids.join(','),{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('OSM '+r.status);ways.push(...(await r.json()).elements);}
const ids=[...new Set(ways.map(w=>w.nodes?.[0]).filter(Boolean))],nodes=[];for(let i=0;i<ids.length;i+=100){const r=await fetch('https://api.openstreetmap.org/api/0.6/nodes.json?nodes='+ids.slice(i,i+100).join(','),{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('OSM '+r.status);nodes.push(...(await r.json()).elements);}
let wayMatched=0;
for(const p of picks){const w=ways.find(w=>w.id===Math.floor(Number(p.id.split('-')[1])/10)),n=nodes.find(n=>n.id===w?.nodes?.[0]),t=w?.tags||{};if(!w||!n||key(t.name)!==key(p.name)||distanceKm(p,{lat:n.lat,lng:n.lon})>.15)continue;const url=safeUrl(t.website||t['contact:website']);if(url){p.website=url;p.websiteEvidence={sourceUrl:`https://www.openstreetmap.org/way/${w.id}`,checkedAt:new Date().toISOString()};wayMatched++;}if(!p.address)p.address=[t['addr:housenumber'],t['addr:street']].filter(Boolean).join(' ');if(t.cuisine)p.cuisine=t.cuisine;}
await writeFile(output,JSON.stringify(source,null,2)+'\n');await writeFile(output+'.evidence.json',JSON.stringify({elements,ways,outlineNodes:nodes,fetchedAt:new Date().toISOString()},null,2)+'\n');console.log({nodes:elements.length,matchedWebsites:matched,totalWithWebsites:source.places.filter(p=>p.website).length});
