// Explicit free-source rebuild: lat lng city output.json
import {writeFile} from 'node:fs/promises';
import {createEditorialService} from '../server/editorial.js';
import {searchInput} from '../server/discovery.js';
const [lat,lng,city,output,radius='3000']=process.argv.slice(2);if(!city||!output)throw Error('Provide lat lng city output.json');
const data=await createEditorialService()({...searchInput(new URLSearchParams({lat,lng,radius,category:'all'})),city});
if(!data.places.length)throw Error('No editorial listings in this area');
await writeFile(output,JSON.stringify(data,null,2)+'\n');console.log({places:data.places.length,photos:data.places.filter(p=>p.photo).length,partial:data.partial});
