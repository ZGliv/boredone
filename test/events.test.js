import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {searchTicketmaster,normalizeTicketmaster,buildTicketmasterUrl,geohash} from '../server/events/ticketmaster.js';
import {createEventsService,eventsHandler,eventsInput,mergeEvents,linkToPlace} from '../server/events/index.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/events/ticketmaster-docs-derived.json',import.meta.url),'utf8'));
const ms=s=>Date.parse(s);
const ev=(over={})=>({id:'x',title:'Late Show',venueName:'Spirit',lat:40.4778,lng:-79.9592,start:'2026-11-13T21:00:00-05:00',end:'',url:'',source:'ical',sourceName:'Feed',placeId:'',fetchedAt:'2026-11-11T00:00:00Z',...over});

test('Ticketmaster fixture is labelled as documentation-derived, not recorded',()=>{assert.match(fixture._fixture,/^DOCUMENTATION-DERIVED, NOT RECORDED/);});
test('Ticketmaster events normalize with the venue zone offset; cancelled and undated ones are skipped',()=>{
 const r=normalizeTicketmaster(fixture,{fetchedAt:'2026-11-11T00:00:00Z'});
 assert.deepEqual(r.events.map(e=>e.id),['tm-vvG1zZfbJQpVWp','tm-docs-all-day','tm-docs-rescheduled']);
 const [a,allDay,moved]=r.events;
 assert.deepEqual(a,{id:'tm-vvG1zZfbJQpVWp',title:'Docs example event',venueName:'Madison Square Garden',lat:40.7497062,lng:-73.9916006,start:'2016-07-27T19:30:00-04:00',end:'',allDay:false,url:'https://www.ticketmaster.com/event/docs-example',source:'ticketmaster',sourceName:'Ticketmaster',placeId:'',fetchedAt:'2026-11-11T00:00:00Z'});
 assert.equal(allDay.start,'2016-07-28T00:00:00-04:00');assert.equal(allDay.end,'2016-07-29T00:00:00-04:00');assert.equal(allDay.allDay,true);assert.equal(moved.allDay,false);
 assert.equal(moved.lat,null);assert.equal(moved.start,'2016-07-29T20:00:00-04:00');
 assert.deepEqual(r.skipped,{cancelled:1,noDate:1});
 assert.deepEqual(normalizeTicketmaster({}).events,[]);assert.deepEqual(normalizeTicketmaster(null).events,[]);
 const winter=normalizeTicketmaster({_embedded:{events:[{id:'w',name:'W',dates:{start:{dateTime:'2026-11-14T01:00:00Z'},timezone:'America/New_York'},_embedded:{venues:[{location:{latitude:'abc',longitude:'-79'}}]}}]}});
 assert.equal(winter.events[0].start,'2026-11-13T20:00:00-05:00');assert.equal(winter.events[0].lat,null);
});
test('Ticketmaster request uses geoPoint, km, whole-second UTC times and no key leaks into errors',async()=>{
 assert.equal(geohash(57.64911,10.40744),'u4pruydqq');
 const url=buildTicketmasterUrl({lat:40.44,lng:-80,radiusKm:9.2,from:ms('2026-11-13T22:00:00.000Z'),to:ms('2026-11-14T08:00:00Z')},'KEY');
 assert.equal(url.origin+url.pathname,'https://app.ticketmaster.com/discovery/v2/events.json');
 assert.equal(url.searchParams.get('startDateTime'),'2026-11-13T22:00:00Z');assert.equal(url.searchParams.get('radius'),'10');assert.equal(url.searchParams.get('unit'),'km');assert.equal(url.searchParams.get('geoPoint').length,9);assert.equal(url.searchParams.has('latlong'),false);
 let calls=0;const none=await searchTicketmaster({lat:40.44,lng:-80,radiusKm:10,from:0,to:1},{apiKey:'',fetcher:async()=>{calls++;}});
 assert.equal(none.status,'unavailable');assert.equal(none.code,503);assert.equal(calls,0);
 const denied=await searchTicketmaster({lat:40.44,lng:-80,radiusKm:10,from:0,to:1},{apiKey:'SECRET',fetcher:async()=>new Response('{}',{status:401})});
 assert.equal(denied.status,'error');assert.doesNotMatch(JSON.stringify(denied),/SECRET/);
 const down=await searchTicketmaster({lat:40.44,lng:-80,radiusKm:10,from:0,to:1},{apiKey:'k',fetcher:async()=>{throw Error('offline');}});assert.equal(down.status,'error');
 const pages=[];const ok=await searchTicketmaster({lat:40.44,lng:-80,radiusKm:10,from:0,to:1},{apiKey:'k',fetcher:async url=>{pages.push(new URL(url).searchParams.get('page'));return Response.json({...fixture,page:{size:100,totalElements:250,totalPages:3,number:pages.length-1}});}});
 assert.deepEqual(pages,['0','1','2']);assert.equal(ok.events.length,9);
});
test('dedupe: same normalized title, starts within 30 minutes, within 200 m; the richer record wins',()=>{
 const tm=ev({id:'tm-1',title:'LATE SHOW!',source:'ticketmaster',url:'https://tm.test/1',start:'2026-11-13T21:20:00-05:00',lat:40.4779,lng:-79.9593});
 const merged=mergeEvents([[ev({end:'2026-11-13T23:00:00-05:00'})],[tm]]);
 assert.equal(merged.length,1);assert.equal(merged[0].id,'tm-1');assert.equal(merged[0].end,'2026-11-13T23:00:00-05:00');
 assert.equal(mergeEvents([[ev()],[{...tm,start:'2026-11-13T21:40:00-05:00'}]]).length,2);
 assert.equal(mergeEvents([[ev()],[{...tm,lat:40.4878}]]).length,2);
 assert.equal(mergeEvents([[ev()],[{...tm,title:'Early Show'}]]).length,2);
 const unplaced=mergeEvents([[ev({lat:null,lng:null,venueName:'The Spirit'})],[tm]]);assert.equal(unplaced.length,1);assert.equal(unplaced[0].lat,40.4779);
 assert.equal(mergeEvents([[ev({lat:null,lng:null,venueName:''})],[tm]]).length,2);
 const sorted=mergeEvents([[ev({id:'b',title:'B',start:'2026-11-13T22:00:00-05:00'}),ev({id:'a',title:'A',start:'2026-11-14T02:30:00Z'})],[ev({id:'bad',start:'tonight'})]]);
 assert.deepEqual(sorted.map(e=>e.id),['a','b']);
});
test('linkToPlace needs both the venue name and the coordinates to agree, and does not mutate',()=>{
 const places=[{id:'p-spirit',name:'Spirit',lat:40.4777,lng:-79.9591},{id:'p-far',name:'Spirit',lat:40.49,lng:-79.9591},{id:'p-next',name:'Pizza Next Door',lat:40.4778,lng:-79.9592}];
 const e=ev();assert.equal(linkToPlace(e,places).placeId,'p-spirit');assert.equal(e.placeId,'');
 assert.equal(linkToPlace(ev({venueName:'Spiritual Center'}),places).placeId,'');
 assert.equal(linkToPlace(ev({venueName:'Thunderbird Music Hall'}),[{id:'t',name:'Thunderbird Music Hall at Butler',lat:40.4778,lng:-79.9592}]).placeId,'t');
 assert.equal(linkToPlace(ev({lat:null,lng:null}),places).placeId,'');assert.equal(linkToPlace(ev({venueName:''}),places).placeId,'');
 assert.equal(linkToPlace(ev(),[]).placeId,'');assert.equal(linkToPlace(ev({lat:40.49}),places.slice(2)).placeId,'');
});
test('query validation: location, radius and a bounded window with explicit offsets',()=>{
 const q=s=>eventsInput(new URLSearchParams(s));
 const ok=q('lat=40.4406&lng=-79.9959&radiusKm=8&from=2026-11-13T17:00:00-05:00&to=2026-11-14T03:00:00-05:00');assert.equal(ok.from,ms('2026-11-13T22:00:00Z'));assert.equal(ok.radiusKm,8);
 for(const bad of ['lng=-79&from=2026-11-13T17:00:00Z&to=2026-11-14T03:00:00Z','lat=40&lng=-79&from=2026-11-13T17:00:00&to=2026-11-14T03:00:00Z','lat=40&lng=-79&from=2026-11-14T03:00:00Z&to=2026-11-13T17:00:00Z','lat=40&lng=-79&from=2026-11-01T00:00:00Z&to=2026-11-30T00:00:00Z','lat=40&lng=-79&radiusKm=500&from=2026-11-13T17:00:00Z&to=2026-11-14T03:00:00Z','lat=95&lng=-79&from=2026-11-13T17:00:00Z&to=2026-11-14T03:00:00Z'])
  assert.throws(()=>q(bad),bad);
});
const ICS='BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:1\r\nSUMMARY:Late Show\r\nDTSTART;TZID=America/New_York:20261113T210000\r\nLOCATION:Spirit\\, 242 51st St\r\nGEO:40.4778;-79.9592\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:2\r\nSUMMARY:Far away\r\nDTSTART;TZID=America/New_York:20261113T210000\r\nGEO:41.5;-79.9592\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
const SOURCES=[{id:'feed',kind:'ical',name:'Feed',url:'https://feed.test/cal?ical=1',home:'https://feed.test/',area:{lat:40.44,lng:-80,radiusKm:30},timeZone:'America/New_York'},{id:'elsewhere',kind:'ical',name:'Elsewhere',url:'https://elsewhere.test/cal',area:{lat:34,lng:-118,radiusKm:30},timeZone:'America/Los_Angeles'}];
const input={lat:40.44,lng:-80,radiusKm:10,from:ms('2026-11-13T22:00:00Z'),to:ms('2026-11-14T08:00:00Z')};
const lookup=async()=>[{address:'93.184.216.34'}];
test('service: one failing source never blanks the others; out-of-area sources are not contacted; radius applies',async()=>{
 const hosts=[];const fetcher=async url=>{const u=new URL(url);hosts.push(u.hostname);if(u.hostname==='app.ticketmaster.com')throw Error('down');if(u.pathname==='/robots.txt')return new Response('',{status:404});return new Response(ICS,{headers:{'content-type':'text/calendar; charset=utf-8'}});};
 const run=createEventsService({fetcher,lookup,sources:SOURCES,apiKey:()=>'k'});
 const r=await run(input);
 assert.deepEqual(r.events.map(e=>e.title),['Late Show']);assert.equal(r.events[0].start,'2026-11-13T21:00:00-05:00');
 assert.deepEqual(r.sources.map(s=>[s.id,s.status,s.count]),[['ticketmaster','error',0],['feed','ok',1]]);
 assert.ok(!hosts.includes('elsewhere.test'));
 const again=await run(input);assert.equal(again.events.length,1);assert.equal(hosts.filter(h=>h==='feed.test').length,2);
 const noKey=await createEventsService({fetcher,lookup,sources:SOURCES,apiKey:()=>''})(input);assert.equal(noKey.sources[0].status,'unavailable');
});
const call=async(url,run,method='GET')=>{const headers={};let body='';const res={statusCode:200,setHeader:(k,v)=>{headers[k.toLowerCase()]=v;},end:b=>{body=b;}};await eventsHandler({method,url},res,run);return {status:res.statusCode,headers,body:JSON.parse(body)};};
const URL_OK='/api/events?lat=40.44&lng=-80&from=2026-11-13T17:00:00-05:00&to=2026-11-14T03:00:00-05:00';
test('handler: method and input errors, short CDN cache when complete, no-store when partial, 503 when everything failed',async()=>{
 assert.equal((await call(URL_OK,null,'POST')).status,405);
 const bad=await call('/api/events?lat=40',async()=>assert.fail('not called'));assert.equal(bad.status,400);assert.equal(bad.headers['cache-control'],'no-store');
 const full=await call(URL_OK,async()=>({events:[ev()],sources:[{id:'ticketmaster',status:'unavailable'},{id:'feed',status:'ok'}]}));
 assert.equal(full.status,200);assert.equal(full.headers['cache-control'],'public, max-age=0, s-maxage=600');assert.equal(full.body.events.length,1);
 const partial=await call(URL_OK,async()=>({events:[ev()],sources:[{id:'ticketmaster',status:'error'},{id:'feed',status:'ok'}]}));assert.equal(partial.status,200);assert.equal(partial.headers['cache-control'],'no-store');
 const none=await call(URL_OK,async()=>({events:[],sources:[{id:'ticketmaster',status:'error'},{id:'feed',status:'error'}]}));assert.equal(none.status,503);
 const thrown=await call(URL_OK,async()=>{throw Error('boom');});assert.equal(thrown.status,503);assert.match(thrown.body.error,/saved places are unaffected/);
});
