import test from 'node:test';import assert from 'node:assert/strict';
import {parseListings,normalizePhoto,createEditorialService} from '../server/editorial.js';
import {venueGroup} from '../src/venues.js';
import {mergeEditorial,rankRecommendations,editorialFreshness} from '../src/recommendations.js';
const input={lat:40.44,lng:-80,radius:3000,category:'all',city:'Pittsburgh'};
const page={title:'Pittsburgh/Downtown',pageid:1,revid:42};
const listing=(name='A Good Meal',extra='')=>`{{eat\n| name=${name}\n|lat=40.44|long=-80|content=Handmade noodles with [[Pittsburgh|local]] vegetables. ${extra}\n|url=https://example.com|lastedit=2025-02-01}}`;
test('parser retains editorial provenance and nested labels without admitting distant or closed places',()=>{
 const text=listing()+listing('Closed','Permanently closed.')+listing('Distant').replace('lat=40.44','lat=41.44')+'{{see|name=Post office|lat=40.44|long=-80}}';
 const result=parseListings(text,page,input,'2026-10-27T00:00:00Z');assert.equal(result.length,1);assert.match(result[0].recommendation.text,/local vegetables/);assert.match(result[0].sourceUrl,/oldid=42/);assert.equal(result[0].hours,'');assert.equal(result[0].recommendation.listingUpdated,'2025-02-01');
});
test('image association uses venue identity and never a generic district photo',()=>{
 const r=parseListings('[[File:Pittsburgh city skyline.jpg|thumb|Pittsburgh]]'+listing()+ '[[File:A Good Meal Pittsburgh.jpg|thumb|A Good Meal]]',page,input,'2026-10-27');assert.equal(r[0].photoFile,'A Good Meal Pittsburgh.jpg');
});
test('photos require author, explicit reusable license and approved Wikimedia image host',()=>{
 const p={title:'File:Meal.jpg',imageinfo:[{thumburl:'https://upload.wikimedia.org/photo.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Meal.jpg',extmetadata:{LicenseShortName:{value:'CC BY-SA 4.0'},LicenseUrl:{value:'https://creativecommons.org/licenses/by-sa/4.0/'},Artist:{value:'<a>Photographer</a>'}}}]};
 assert.equal(normalizePhoto(p).author,'Photographer');p.imageinfo[0].thumburl='https://other.test/photo.jpg';assert.equal(normalizePhoto(p),null);p.imageinfo[0].thumburl='https://upload.wikimedia.org/photo.jpg';p.imageinfo[0].extmetadata.LicenseShortName.value='All rights reserved';assert.equal(normalizePhoto(p),null);
});
test('merging preserves saved provider identity and does not confuse chain locations',()=>{
 const base=[{id:'osm-1',name:'A Good Meal',lat:40.44,lng:-80,category:'restaurant'}],rec={...base[0],id:'wv-1',recommendation:{text:'Editorial reason'},photo:{url:'/photo.jpg'}};
 const merged=mergeEditorial(base,[rec]);assert.equal(merged[0].id,'osm-1');assert.equal(base[0].recommendation,undefined);assert.equal(merged[0].photo.url,'/photo.jpg');
 assert.equal(mergeEditorial(base,[{...rec,lat:41}]).length,2);
});
test('editorial evidence outranks bare proximity; poor personal ratings lower a recommendation',()=>{
 const nearby={place:{id:'near',category:'restaurant',distanceKm:.1}},recommended={place:{id:'rec',category:'restaurant',distanceKm:1,recommendation:{text:'Guide reason'}}};
 assert.equal(rankRecommendations([nearby,recommended])[0].place.id,'rec');
 const ranked=rankRecommendations([nearby,recommended],[{place:recommended.place,status:'visited',rating:1,visitDate:'2026-10-27'}]);assert.equal(ranked[0].place.id,'near');assert.match(ranked[1].why[0],/1\/5/);
});
test('free source adapter bounds city pages, reuses complete results, and does not need credentials',async()=>{
 let calls=0;const service=createEditorialService({fetcher:async(url)=>{calls++;const u=new URL(url);assert.ok(['en.wikivoyage.org','commons.wikimedia.org'].includes(u.hostname));return Response.json(u.searchParams.get('action')==='parse'?{parse:{...page,links:[],wikitext:{'*':listing()}}}:{query:{geosearch:[]}});}});
 const a=await service(input),b=await service(input);assert.equal(a,b);assert.equal(a.places.length,1);assert.equal(calls,2);
});
test('confirmed closed locations are excluded from public discovery without mutating source or saved records',()=>{
 const closed={id:'closed',name:'Hard Rock Cafe',lat:40.43397,lng:-80.00491,category:'restaurant'};
 const elsewhere={...closed,id:'elsewhere',lat:42};const input=[closed,elsewhere];assert.deepEqual(mergeEditorial(input,[]).map(p=>p.id),['elsewhere']);assert.equal(input.length,2);
});


test('an exact provider ID wins over ambiguous nearby names and blocked websites lose old previews',()=>{
 const a={id:'a',name:'Same name',lat:40.44,lng:-80,website:'https://old.example',websitePhoto:{url:'https://old.example/image.jpg'}},b={...a,id:'b'};
 const enriched=mergeEditorial([a,b],[{...a,websitePhoto:{url:'https://new.example/photo.jpg'}}]);
 assert.equal(enriched.find(p=>p.id==='a').websitePhoto.url,'https://new.example/photo.jpg');
 assert.equal(enriched.find(p=>p.id==='b').websitePhoto.url,a.websitePhoto.url);
 const blocked=mergeEditorial([a],[{...a,websiteBlocked:true}])[0];assert.equal(blocked.website,'');assert.equal(blocked.websitePhoto,undefined);assert.ok(a.websitePhoto);
});


test('source freshness uses the actual listing date, never retrieval time or invalid dates',()=>{
 const now=Date.parse('2026-11-07');
 assert.equal(editorialFreshness({listingUpdated:'2025-02-01'},now),'dated');
 assert.equal(editorialFreshness({listingUpdated:'2015-08-26',retrievedAt:'2026-11-07'},now),'old');
 for(const date of [null,'garbage','2026-02-30','2027-01-01'])assert.equal(editorialFreshness({listingUpdated:date},now),'unknown');
});
test('a photo cannot outrank dated evidence or a personal favorite; old guide entries get no freshness boost',()=>{
 const now=Date.parse('2026-11-07');
 const make=(id,extra={})=>({place:{id,category:'restaurant',distanceKm:1,...extra}});
 const photo=make('photo',{photo:{url:'/photo.jpg'}}),guide=make('guide',{recommendation:{text:'Source excerpt',listingUpdated:'2025-01-01'}}),favorite=make('favorite');
 const old=make('old',{recommendation:{text:'Historical note',listingUpdated:'2015-01-01'}}),plain=make('plain');
 const outings=[{place:favorite.place,status:'visited',rating:5,visitDate:'2026-10-01'}];
 assert.deepEqual(rankRecommendations([photo,guide,favorite],outings,now).map(x=>x.place.id),['favorite','guide','photo']);
 const ranked=rankRecommendations([old,plain],[],now);assert.equal(ranked[0].score,ranked[1].score);
 const low=[{place:guide.place,status:'visited',rating:1,visitDate:'2026-10-01'}];
 assert.equal(rankRecommendations([photo,guide],low,now)[0].place.id,'photo');
});


test('optimized variety ordering matches the prior full-sort algorithm across a large mixed guide',()=>{
 const categories=['restaurant','cafe','pub','cinema','escape_game','unknown'];
 const items=Array.from({length:600},(_,i)=>({place:{id:`place-${i}`,category:categories[i%categories.length],distanceKm:(i%37)/10,...(i%4===0?{photo:{url:'/photo.jpg'}}:{}),...(i%3===0?{recommendation:{text:'Guide note',listingUpdated:i%2===0?'2025-01-01':'2015-01-01'}}:{})}}));
 const snapshot=structuredClone(items);
 const ranked=rankRecommendations(items,[],Date.parse('2026-11-07'));
 const remaining=ranked.slice().reverse(),counts=new Map(),legacy=[];
 while(remaining.length){
  remaining.sort((a,b)=>(b.score-3*(counts.get(venueGroup(b.place.category))||0))-(a.score-3*(counts.get(venueGroup(a.place.category))||0))||a.place.id.localeCompare(b.place.id));
  const next=remaining.shift(),group=venueGroup(next.place.category);
  counts.set(group,(counts.get(group)||0)+1);legacy.push(next.place.id);
 }
 assert.deepEqual(ranked.map(item=>item.place.id),legacy);
 assert.deepEqual(items,snapshot);
});
