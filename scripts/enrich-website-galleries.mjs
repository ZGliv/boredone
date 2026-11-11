// Maintainer-only candidate research: official pages plus at most two gallery/menu links.
// Usage: node scripts/enrich-website-galleries.mjs input.json output.json
// Results require business-identity and visual review before publication. No paid APIs.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {fetchPublicPage,previewUrl,robotsAllows,galleryPhotoCandidates} from '../server/site-previews.js';
const [input,output]=process.argv.slice(2);if(!output)throw Error('Provide input and output JSON');
const root=dirname(output),source=JSON.parse(await readFile(input));
const unique=[...new Map(source.places.filter(p=>p.website&&!p.websiteBlocked).slice(0,700).map(p=>[p.id,p])).values()];
const robots=new Map(),out=[];await mkdir(root+'/gallery-pages',{recursive:true});
async function get(url){const u=new URL(url);if(!robots.has(u.origin))robots.set(u.origin,fetchPublicPage(u.origin+'/robots.txt',{timeout:5000,maxBytes:600000,truncate:true}).then(r=>r.html).catch(e=>{if(/404|410/.test(e.message))return '';throw e;}));if(!robotsAllows(await robots.get(u.origin),u.pathname))throw Error('Robots');return fetchPublicPage(url,{timeout:9000,maxBytes:1600000,truncate:true});}
async function visit(p){try{const url=previewUrl(p.website.replace(/^http:/,'https:'));if(!url||/facebook|instagram|myspace|restaurantguru|weeblyte|mobile-webview|menuweb|chowbus|toasttab|dinehere|yelp|tripadvisor/.test(new URL(url).hostname))return;const home=await get(url);let pages=[home];const links=[...home.html.matchAll(/href=["']([^"']+)["']/gi)].map(m=>previewUrl(m[1],home.url)).filter(x=>x&&new URL(x).origin===new URL(home.url).origin&&/gallery|photos|about|pittsburgh|food|menu|location/i.test(new URL(x).pathname)&&!/.pdf|\.jpg|\?|\/tag\/|\/cart/.test(x));for(const link of [...new Set(links)].filter(x=>x!==home.url).slice(0,2)){try{pages.push(await get(link));}catch{}}
const photos=[];for(const page of pages){const title=page.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'';if(/casino|slot online|togel|jackpot|viagra|betting|arisantoto|hoki178|ga6789|kari4d|vavada|domain.*sale/i.test(title))throw Error('Unrelated domain');const file=createHash('sha256').update(page.url).digest('hex').slice(0,16)+'.html';await writeFile(root+'/gallery-pages/'+file,page.html);for(const image of galleryPhotoCandidates(page.html,page.url))if(!photos.some(x=>x.url===image))photos.push({url:image,sourceUrl:page.url});}out.push({...p,galleryCandidates:photos.slice(0,24)});
}catch(e){out.push({...p,previewError:e.message});}}
for(let i=0;i<unique.length;i+=5){await Promise.all(unique.slice(i,i+5).map(visit));await writeFile(output,JSON.stringify({places:out},null,2));console.log(i+5,unique.length,out.filter(x=>x.galleryCandidates?.length).length);}
