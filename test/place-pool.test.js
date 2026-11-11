import test from 'node:test';
import assert from 'node:assert/strict';
import { diversePool } from '../server/place-pool.js';
import { rankPlaces } from '../src/shortlist.js';
import { normalizePlaces } from '../server/discovery.js';
import { selectAreaPlaces } from '../server/offline-area.js';
const cafes = Array.from({length:140}, (_,i) => ({id:`c${i}`,name:`Cafe ${i}`,category:'cafe',distanceKm:i/1000}));
const others = ['park','museum','bowling alley'].map((category,i) => ({id:`other${i}`,name:category,category,distanceKm:.8+i/10}));
test('dense food coverage cannot evict less common activities from the bounded pool', () => {
 const input = [...cafes,...others], before=structuredClone(input), result=diversePool(input);
 assert.equal(result.length,120); assert.ok(others.every(p=>result.includes(p)));
 assert.deepEqual(input,before); assert.equal(new Set(result.map(p=>p.id)).size,120);
});
test('both real provider adapters preserve variety before their cache limit', () => {
 const input={lat:40.44,lng:-80,radius:3000,category:'all'};
 const venues = ["bar","cinema","escape game"].map((category,i)=>({id:`v${i}`,name:category,category,distanceKm:.5}));
 const all=[...cafes,...venues];
 const elements=all.map((p,i)=>({id:i,type:'node',lat:40.44+i/100000,lon:-80,tags:{name:p.name,amenity:p.category.replaceAll(" ","_")}}));
 const live=normalizePlaces({elements},input);
 const area=selectAreaPlaces(all.map((p,i)=>({id:i,name:p.name,lat:40.44+i/100000,lng:-80,kind:p.category.replaceAll(' ','_')})),input);
 for(const result of [live,area]) {assert.equal(result.length,120); for(const p of venues) assert.ok(result.some(r=>r.name===p.name));}
});
test('ranked batches provide variety, no repeated candidates, and keep mood/time constraints', () => {
 const ranked=rankPlaces([...cafes,...others],[]);
 assert.deepEqual(ranked.slice(0,3).map(r=>r.place.category),['cafe','park','museum']);
 assert.equal(new Set(ranked.map(r=>r.place.id)).size,ranked.length);
 assert.ok(rankPlaces([...cafes,...others],[],'food','30').every(r=>r.place.category==='cafe' && r.place.distanceKm<=.5));
});

test('rarer venue types survive dense artwork coverage', () => {
 const art=Array.from({length:140},(_,i)=>({id:`a${i}`,category:'artwork',distanceKm:i/100}));
 const museum={id:'museum',category:'museum',distanceKm:2};
 assert.ok(diversePool([...art,museum]).includes(museum));
});
