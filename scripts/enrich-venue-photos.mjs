// Optional bounded second pass for a maintainer-requested guide refresh.
// Searches exact venue names, preserving evidence after every response.
import{readFile,writeFile}from'node:fs/promises';
import{mergeEditorial}from'../src/recommendations.js';
import{matchVenuePhoto}from'../server/commons-photos.js';
const[basePath,contentPath,city]=process.argv.slice(2);if(!city)throw Error('Provide base.json content.json city');
const base=JSON.parse(await readFile(basePath)),content=JSON.parse(await readFile(contentPath));
const venues=mergeEditorial(base.places,content.places),evidencePath=contentPath+'.evidence.json';
const pages=JSON.parse(await readFile(evidencePath)),known=new Map(pages.map(p=>[p.pageid,p]));
const missing=venues.filter(p=>!p.photo&&p.recommendation?.text).slice(0,40);const errors=[];
for(const p of missing){
 try{
 const url=new URL('https://commons.wikimedia.org/w/api.php');url.search=new URLSearchParams({action:'query',generator:'search',gsrsearch:`"${p.name.replaceAll('"','')}" "${city.replaceAll('"','')}" filetype:bitmap`,gsrnamespace:'6',gsrlimit:'5',prop:'imageinfo|coordinates',colimit:'max',iiprop:'url|extmetadata',iiurlwidth:'640',format:'json',maxlag:'5'});
 const response=await fetch(url,{headers:{'User-Agent':'Bordone/0.6 (https://boredone.vercel.app)'},signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error(String(response.status));const d=await response.json();if(d.error)throw Error(d.error.info);
 for(const page of Object.values(d.query?.pages||{}))known.set(page.pageid,{...known.get(page.pageid),...page});
 await writeFile(evidencePath,JSON.stringify([...known.values()],null,2)+'\n');
 }catch(error){errors.push({name:p.name,error:error.message});}
}
for(const p of venues)p.photo=matchVenuePhoto(p,[...known.values()],venues,city)||p.photo;
content.places=venues.filter(p=>p.photo||p.recommendation);content.photoIndex={...content.photoIndex,files:known.size,exactNameRequests:missing.length,exactNameErrors:errors};
await writeFile(contentPath,JSON.stringify(content,null,2)+'\n');console.log(JSON.stringify({venues:venues.length,photos:venues.filter(p=>p.photo).map(p=>({name:p.name,title:p.photo.title})),errors},null,2));
