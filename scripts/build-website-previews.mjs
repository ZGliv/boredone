// Read explicit venue website URLs and collect published sharing-image metadata.
// No images are copied into the offline bundle. Usage: input.json output.json [limit]
import{readFile,writeFile}from'node:fs/promises';import{fetchPublicPage,previewUrl,extractWebsitePreview,robotsAllows}from'../server/site-previews.js';
const[input,output,limit='700']=process.argv.slice(2);if(!output)throw Error('Provide input and output JSON');
let previous=[];try{previous=JSON.parse(await readFile(output)).places||[];}catch{}
const source=JSON.parse(await readFile(input)),venues=source.places.filter(p=>p.website).slice(0,Math.min(700,Number(limit))),results=[],robots=new Map(),pages=new Map();
async function visit(p){const prior=previous.find(x=>x.id===p.id);if(prior?.websitePhoto && prior.websitePhoto.url!==prior.website)return prior;let url=previewUrl(p.website.replace(/^http:/,'https:'));if(!url)return {...p,previewError:'Invalid website URL'};
 try{
 const u=new URL(url);
 if(['dinehere.us','restaurantguru.com','restaurantji.com','menuweb.menu','zmenu.com','facebook.com','instagram.com','yelp.com','tripadvisor.com'].some(host=>u.hostname===host||u.hostname.endsWith('.'+host)))throw Error('Directory/social page, not a venue website');if(!robots.has(u.origin))robots.set(u.origin,fetchPublicPage(u.origin+'/robots.txt',{maxBytes:150000,timeout:6000}).then(r=>r.html).catch(e=>{if(/HTTP 404|HTTP 410/.test(e.message))return '';throw e;}));
 if(!robotsAllows(await robots.get(u.origin),u.pathname))throw Error('Robots disallows page');
 if(!pages.has(url))pages.set(url,fetchPublicPage(url,{maxBytes:1000000,truncate:true}));const page=await pages.get(url);const result=extractWebsitePreview(page.html,page.url,p);
 return {...p,...(result.photo?{website:result.website,websitePhoto:result.photo}:{}),previewCandidates:result.candidates||[],previewTitle:result.title,previewError:result.reason||null};
 }catch(e){return {...p,previewError:e.message};}}
for(let i=0;i<venues.length;i+=3){results.push(...await Promise.all(venues.slice(i,i+3).map(visit)));await writeFile(output,JSON.stringify({places:results,fetchedAt:new Date().toISOString(),source:'Venue website sharing metadata'},null,2)+'\n');console.log(`${results.length}/${venues.length}: ${results.filter(p=>p.websitePhoto).length} previews`);}
