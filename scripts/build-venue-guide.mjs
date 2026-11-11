// Explicit maintainer-requested area snapshot, never a scheduled/background crawl.
// node scripts/build-venue-guide.mjs 40.44 -80 Pittsburgh src/data/pittsburgh.json
import {writeFile} from 'node:fs/promises';
import {createOfflineAreaService} from '../server/offline-area.js';
import {searchInput} from '../server/discovery.js';
import {isVenue} from '../src/venues.js';
const [lat,lng,name,output]=process.argv.slice(2);
if(!name || !output) throw Error('Provide latitude, longitude, city name and output JSON path.');
const input=searchInput(new URLSearchParams({lat,lng,radius:'5000',category:'all'}));
const data=await createOfflineAreaService({placeLimit:600})(input);
if(!data.places.length || !data.places.every(isVenue)) throw Error('Refusing an empty or non-venue guide.');
await writeFile(output,JSON.stringify({...data,cityName:name,cityLabel:name,category:'all',poolVersion:3,bundled:true},null,2)+'\n');
console.log(`Saved ${data.places.length} venues for ${name}; source date ${data.sourceUpdatedAt}.`);
