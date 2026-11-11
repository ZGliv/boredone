// Explicit, bounded free photo index. Usage: base.json editorial.json output.json city
import {readFile,writeFile} from 'node:fs/promises';
import {collectCommonsPhotos,matchVenuePhoto} from '../server/commons-photos.js';
import {mergeEditorial} from '../src/recommendations.js';
const [basePath,editorialPath,output,city,seedPath]=process.argv.slice(2);if(!city)throw Error('Provide base.json editorial.json output.json city');
const base=JSON.parse(await readFile(basePath)),editorial=JSON.parse(await readFile(editorialPath));
const venues=mergeEditorial(base.places,editorial.places);
const seedPages=seedPath?JSON.parse(await readFile(seedPath)):[];
const {pages,failures}=await collectCommonsPhotos(city,{seedPages});
await writeFile(output+'.evidence.json',JSON.stringify(pages,null,2)+'\n');
for(const p of venues){p.photo=matchVenuePhoto(p,pages,venues,city)||p.photo;}
const places=venues.filter(p=>p.photo||p.recommendation);
await writeFile(output,JSON.stringify({...editorial,places,photoIndex:{city,files:pages.length,failures,retrievedAt:new Date().toISOString()}},null,2)+'\n');
console.log(JSON.stringify({venues:venues.length,indexedPhotos:pages.length,matched:places.filter(p=>p.photo).map(p=>({name:p.name,title:p.photo.title,match:p.photo.match}))},null,2));
