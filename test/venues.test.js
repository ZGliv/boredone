import test from 'node:test';
import assert from 'node:assert/strict';
import {isVenue,matchesVenueMood} from '../src/venues.js';
import {selectAreaPlaces} from '../server/offline-area.js';
import {normalizePlaces,buildQuery} from '../server/discovery.js';
import {preloadedDiscovery,DEFAULT_AREA} from '../src/preloaded.js';
const input={lat:40.44,lng:-80,radius:3000,category:'all'};
test('going-out policy includes real nightlife and excludes civic POIs, parks and gyms',()=>{
 for(const category of ['restaurant','bar','pub','nightclub','cafe','cinema','miniature golf']) assert.ok(isVenue({category}));
 for(const category of ['park','post office','bank','school','sports centre','attraction','museum','artwork','unknown']) assert.equal(isVenue({category}),false,category);
 assert.ok(matchesVenueMood({category:'pub'},'drinks'));
 assert.ok(matchesVenueMood({category:'art_studio'},'play'));
 assert.ok(matchesVenueMood({category:'tabletop_gaming'},'play'));
 assert.ok(matchesVenueMood({category:'cat_lounge'},'play'));
 assert.ok(matchesVenueMood({category:'horseback_riding'},'sports'));
 assert.ok(matchesVenueMood({category:'pickleball_court'},'sports'));
 assert.ok(matchesVenueMood({category:'obstacle_course'},'sports'));
 assert.ok(matchesVenueMood({category:'winery'},'drinks'));
 assert.equal(matchesVenueMood({category:'art_studio'},'drinks'),false);
 assert.equal(matchesVenueMood({category:'restaurant'},'drinks'),false);
});
test('broad provider classes cannot turn a post office into a venue',()=>{
 const features=[{id:1,name:'Post office',kind:'post_office',class:'restaurant',lat:40.44,lng:-80},{id:2,name:'Actual pub',kind:'pub',class:'food',lat:40.44,lng:-80}];
 assert.deepEqual(selectAreaPlaces(features,input).map(p=>p.name),['Actual pub']);
 const elements=features.map(p=>({id:p.id,type:'node',lat:p.lat,lon:p.lng,tags:{name:p.name,amenity:p.kind}}));
 assert.deepEqual(normalizePlaces({elements},input).map(p=>p.name),['Actual pub']);
 assert.match(buildQuery(input),/bar\|pub/);
 assert.doesNotMatch(buildQuery(input),/park|sports_centre|attraction/);
});
test('legacy Pittsburgh public cache upgrades without touching saved outings',()=>{
 const old={area:DEFAULT_AREA,result:{poolVersion:2,radius:3000,places:[{id:'old',category:'park'}]}};
 const next=preloadedDiscovery(old);
 assert.equal(next.result.poolVersion,3); assert.ok(next.result.places.length>120);
 assert.ok(next.result.places.every(isVenue)); assert.ok(next.result.places.some(p=>p.category==='bar'));
 assert.equal(old.result.places[0].id,'old');
});
test('closed Denis Theatre is hidden from discovery without suppressing nearby venues', async()=>{
 const {isSuppressedVenue}=await import('../src/venueCorrections.js');
 assert.equal(isSuppressedVenue({name:'Denis Theatre',lat:40.38091,lng:-80.04418}),true);
 assert.equal(isSuppressedVenue({name:'East End Brewery Taproom',lat:40.3818,lng:-80.04399}),false);
 assert.equal(isSuppressedVenue({name:'Denis Theatre',lat:41,lng:-80}),false);
});
test('seasonal closure expires without changing a saved place', async()=>{
 const {isSuppressedVenue}=await import('../src/venueCorrections.js');
 const place={name:'Forsythe Miniature Golf',lat:40.40518,lng:-80.07532};
 assert.equal(isSuppressedVenue(place,Date.parse('2026-10-29T12:00:00Z')),true);
 assert.equal(isSuppressedVenue(place,Date.parse('2027-05-02T12:00:00Z')),false);
 assert.equal(place.name,'Forsythe Miniature Golf');
});
test('the replaced Market Street coffee counter is suppressed without hiding its successor', async()=>{
 const {isSuppressedVenue}=await import('../src/venueCorrections.js');
 const location={lat:40.44116,lng:-80.00237};
 assert.equal(isSuppressedVenue({...location,name:'De Fer Coffee & Tea'}),true);
 assert.equal(isSuppressedVenue({...location,name:'The Boredom Set'}),false);
 assert.equal(isSuppressedVenue({name:'De Fer Coffee & Tea',lat:40.45172,lng:-79.98437}),false);
});

test('closed Bado’s is suppressed without hiding its successor or distant namesakes', async()=>{
 const {isSuppressedVenue}=await import('../src/venueCorrections.js');
 const location={lat:40.38849,lng:-80.04973};
 assert.equal(isSuppressedVenue({...location,name:"Bado's Pizza Grill and Ale House"}),true);
 assert.equal(isSuppressedVenue({...location,name:'F&F Pizzeria'}),false);
 assert.equal(isSuppressedVenue({name:"Bado's Pizza Grill and Ale House",lat:41,lng:-80}),false);
});

test('Beverly Road io closures do not hide the brasserie or bakery', async()=>{
 const {isSuppressedVenue}=await import('../src/venueCorrections.js');
 assert.equal(isSuppressedVenue({name:'io Deli',lat:40.38879,lng:-80.04996}),true);
 assert.equal(isSuppressedVenue({name:'Cafe io',lat:40.38887,lng:-80.04981}),true);
 assert.equal(isSuppressedVenue({name:"Iovino's Neighborhood Brasserie",lat:40.38879,lng:-80.04996}),false);
 assert.equal(isSuppressedVenue({name:'Panadería Jazmin',lat:40.38882,lng:-80.0499}),false);
});

test('Cucina Vitale’s former location is suppressed without hiding the new restaurant', async()=>{
 const {isSuppressedVenue}=await import('../src/venueCorrections.js');
 assert.equal(isSuppressedVenue({name:'Cucina Vitale',lat:40.42748,lng:-79.96908}),true);
 assert.equal(isSuppressedVenue({name:'Cucina Vitale',lat:40.42039,lng:-80.06387}),false);
});

test('former 412 Brewery does not hide its successor', async()=>{
 const {isSuppressedVenue}=await import('../src/venueCorrections.js');
 const location={lat:40.45192,lng:-80.01597};
 assert.equal(isSuppressedVenue({...location,name:'412 Brewery'}),true);
 assert.equal(isSuppressedVenue({...location,name:'Late Addition Brewing + Blending'}),false);
});

test('closed downtown venues are hidden without hiding unrelated neighbors', async()=>{
 const {isSuppressedVenue}=await import('../src/venueCorrections.js');
 assert.equal(isSuppressedVenue({name:'Union Standard',lat:40.44030,lng:-79.99717}),true);
 assert.equal(isSuppressedVenue({name:'Barcadia',lat:40.44112,lng:-80.00288}),true);
 assert.equal(isSuppressedVenue({name:'Slider Vibes',lat:40.44122,lng:-80.00281}),true);
 assert.equal(isSuppressedVenue({name:'The Yard',lat:40.44122,lng:-80.00281}),false);
 assert.equal(isSuppressedVenue({name:'Union Standard',lat:41,lng:-80}),false);
});

test('closed Galleria venues do not suppress the nearby South Hills Village cinema', async()=>{
 const {isSuppressedVenue}=await import('../src/venueCorrections.js');
 assert.equal(isSuppressedVenue({name:'AMC CLASSIC Mount Lebanon 6',lat:40.35713,lng:-80.05213}),true);
 assert.equal(isSuppressedVenue({name:'Bravo',lat:40.35640,lng:-80.05105}),true);
 assert.equal(isSuppressedVenue({name:'AMC CLASSIC South Hills Village 10',lat:40.34343,lng:-80.05392}),false);
 assert.equal(isSuppressedVenue({name:'Bravo',lat:40.4,lng:-80.05}),false);
});

test('Baxter’s indefinite closure does not hide nearby or distant venues', async()=>{
 const {isSuppressedVenue}=await import('../src/venueCorrections.js');
 assert.equal(isSuppressedVenue({name:"Baxter's R-Cade",lat:40.2755485,lng:-80.1670322}),true);
 assert.equal(isSuppressedVenue({name:'Another Arcade',lat:40.2755485,lng:-80.1670322}),false);
 assert.equal(isSuppressedVenue({name:"Baxter's R-Cade",lat:41,lng:-80.1670322}),false);
});

test('closed Wild Rosemary is excluded only at its former location', async()=>{
 const {isSuppressedVenue}=await import('../src/venueCorrections.js');
 assert.equal(isSuppressedVenue({name:'Wild Rosemary Bistro',lat:40.36198,lng:-80.0935}),true);
 assert.equal(isSuppressedVenue({name:'Other Bistro',lat:40.36198,lng:-80.0935}),false);
 assert.equal(isSuppressedVenue({name:'Wild Rosemary Bistro',lat:41,lng:-80.0935}),false);
});

test('former South Hills Atarashi is suppressed without hiding Poke Sushi or other branches', async()=>{
 const {isSuppressedVenue}=await import('../src/venueCorrections.js');
 assert.equal(isSuppressedVenue({name:'Atarashi Sushi',lat:40.34810,lng:-80.05406}),true);
 assert.equal(isSuppressedVenue({name:'Poke Sushi',lat:40.34810,lng:-80.05406}),false);
 assert.equal(isSuppressedVenue({name:'Sushi Atarashi',lat:40.44,lng:-79.95}),false);
});

test('former Oya Sushi is suppressed without hiding its successor', async()=>{
 const {isSuppressedVenue}=await import('../src/venueCorrections.js');
 assert.equal(isSuppressedVenue({name:'Oya Sushi',lat:40.36948,lng:-80.03514}),true);
 assert.equal(isSuppressedVenue({name:'Krunchy Bird',lat:40.36948,lng:-80.03514}),false);
 assert.equal(isSuppressedVenue({name:'Oya Sushi',lat:41,lng:-80.03514}),false);
});

test('former Hank’s pin is suppressed without hiding Pepito’s or distant namesakes', async()=>{
 const {isSuppressedVenue}=await import('../src/venueCorrections.js');
 assert.equal(isSuppressedVenue({name:"Hank's Dogs",lat:40.3928,lng:-80.01844}),true);
 assert.equal(isSuppressedVenue({name:"Pepito’s Place",lat:40.39285,lng:-80.01837}),false);
 assert.equal(isSuppressedVenue({name:"Hank's Dogs",lat:41,lng:-80.01844}),false);
});

test('stale Big Shot Bob address is hidden without hiding the current branch or its successor',async()=>{
 const {isSuppressedVenue}=await import('../src/venueCorrections.js');
 assert.equal(isSuppressedVenue({name:"Big Shot Bob's",lat:40.405437,lng:-80.030031}),true);
 assert.equal(isSuppressedVenue({name:"Big Shot Bob's House of Wings",lat:40.397982,lng:-80.026174}),false);
 assert.equal(isSuppressedVenue({name:'Mexican Sazón Lichita',lat:40.405394,lng:-80.030122}),false);
 assert.equal(isSuppressedVenue({name:"Big Shot Bob's",lat:41,lng:-80.030031}),false);
});

test('closed Nick’s Pizza does not hide its neighbor or distant namesakes',async()=>{
 const {isSuppressedVenue}=await import('../src/venueCorrections.js');
 assert.equal(isSuppressedVenue({name:"Nick's Pizza",lat:40.369517,lng:-80.034837}),true);
 assert.equal(isSuppressedVenue({name:'Castle Place',lat:40.369530,lng:-80.034767}),false);
 assert.equal(isSuppressedVenue({name:"Nick's Pizza",lat:41,lng:-80.034837}),false);
});

test('closed South Fayette Lucha does not hide other venues or branches',async()=>{
 const {isSuppressedVenue}=await import('../src/venueCorrections.js');
 assert.equal(isSuppressedVenue({name:'Lucha Street Tacos',lat:40.34414,lng:-80.11512}),true);
 assert.equal(isSuppressedVenue({name:'Oasis Restaurant',lat:40.34414,lng:-80.11512}),false);
 assert.equal(isSuppressedVenue({name:'Lucha Street Tacos',lat:40.43,lng:-79.92}),false);
});

test('closed Rooster’s Roadhouse is excluded only at its former location',async()=>{
 const {isSuppressedVenue}=await import('../src/venueCorrections.js');
 assert.equal(isSuppressedVenue({name:"Rooster's Roadhouse",lat:40.37888,lng:-80.14638}),true);
 assert.equal(isSuppressedVenue({name:"Rooster's Roadhouse",lat:41,lng:-80.14638}),false);
 assert.equal(isSuppressedVenue({name:'Another restaurant',lat:40.37888,lng:-80.14638}),false);
});

test('sports filters active outings without mixing restaurants or creative activities',()=>{
 for(const category of ['bowling_alley','miniature golf','pickleball_court','ice_rink','golf_simulator']) {
  assert.ok(matchesVenueMood({category},'sports'));
  assert.equal(matchesVenueMood({category},'play'),false);
 }
 for(const category of ['restaurant','pub','art_studio','tabletop_gaming','gym']) assert.equal(matchesVenueMood({category},'sports'),false);
 assert.ok(matchesVenueMood({category:'art_studio'},'play'));
});
