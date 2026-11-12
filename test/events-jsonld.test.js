import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {extractEvents,jsonLdBlocks,fetchPublic,checkPublicUrl,isPrivateAddress,robotsAllows} from '../server/events/jsonld.js';
const NY='America/New_York',ms=s=>Date.parse(s);
const page=(...objs)=>`<html><head><title>x</title>${objs.map(o=>`<script type="application/ld+json">${typeof o==='string'?o:JSON.stringify(o)}</script>`).join('')}<script>var x=1</script></head></html>`;
const opts={baseUrl:'https://venue.test/events/',sourceName:'Venue',fetchedAt:'2026-11-11T00:00:00Z',timeZone:NY};
const base={'@type':'Event',name:'Late Show',startDate:'2026-11-13T21:00:00-05:00',location:{'@type':'Place',name:'Main Room'}};

test('recorded City of Asylum page yields every listed program with decoded titles and its real offsets',()=>{
 const html=readFileSync(new URL('./fixtures/events/cityofasylum-events.html',import.meta.url),'utf8');
 assert.match(html,/Recorded from https:\/\/cityofasylum\.org\/events\/ on 2026-11-12T00:04:48Z/);
 const r=extractEvents(html,{...opts,baseUrl:'https://cityofasylum.org/events/',sourceName:'City of Asylum'});
 assert.equal(r.events.length,11);
 const jazz=r.events.find(e=>e.title.startsWith('Thursday Night Jazz: Two of Anything'));
 assert.match(jazz.title,/Anything’s New/);assert.equal(jazz.start,'2026-11-12T19:00:00-05:00');assert.equal(jazz.end,'2026-11-12T20:30:00-05:00');
 assert.equal(jazz.venueName,'Alphabet City');assert.equal(jazz.lat,null);assert.equal(jazz.source,'jsonld');assert.match(jazz.url,/^https:\/\/cityofasylum\.org\/program\//);
 assert.ok(r.events.some(e=>e.title.includes('Kaleta & Super Yamba Band')));
 const friday=extractEvents(html,{...opts,from:ms('2026-11-13T22:00:00Z'),to:ms('2026-11-14T08:00:00Z')});assert.equal(friday.events.length,0);
});
test('finds events inside @graph, arrays, ItemLists and subtype arrays; skips cancelled, postponed and online',()=>{
 const html=page({'@context':'https://schema.org','@graph':[{'@type':'WebPage',name:'Events'},{...base,'@type':['MusicEvent'],url:'/shows/late'}]},
  [{...base,name:'Comedy Night','@type':'ComedyEvent',eventStatus:'https://schema.org/EventCancelled'},{...base,name:'Moved',eventStatus:'EventPostponed'}],
  {'@type':'ItemList',itemListElement:[{'@type':'ListItem',item:{...base,name:'Listed Show',location:{'@type':'Place',name:'Annex',geo:{'@type':'GeoCoordinates',latitude:'40.4512',longitude:'-79.9853'}}}}]},
  {...base,name:'Stream',location:{'@type':'VirtualLocation',url:'https://stream.test'}},{...base,name:'Webinar',eventAttendanceMode:'https://schema.org/OnlineEventAttendanceMode'});
 const r=extractEvents(html,opts);
 assert.deepEqual(r.events.map(e=>e.title).sort(),['Late Show','Listed Show']);
 assert.equal(r.events.find(e=>e.title==='Late Show').url,'https://venue.test/shows/late');
 const listed=r.events.find(e=>e.title==='Listed Show');assert.equal(listed.lat,40.4512);assert.equal(listed.lng,-79.9853);assert.equal(listed.venueName,'Annex');
 assert.deepEqual(r.skipped,{cancelled:1,postponed:1,online:2});
});
test('date forms: offset kept in the source zone, date-only is all day, floating needs a known zone',()=>{
 const r=extractEvents(page({...base,startDate:'2026-11-14T02:00:00Z'},{...base,name:'Fair',startDate:'2026-11-01'},{...base,name:'Local',startDate:'2026-07-04T21:00'}),opts);
 assert.equal(r.events.find(e=>e.title==='Late Show').start,'2026-11-13T21:00:00-05:00');
 const fair=r.events.find(e=>e.title==='Fair');assert.equal(fair.start,'2026-11-01T00:00:00-04:00');assert.equal(fair.end,'2026-11-02T00:00:00-05:00');assert.equal(fair.allDay,true);
 assert.equal(r.events.find(e=>e.title==='Late Show').allDay,false);
 assert.equal(r.events.find(e=>e.title==='Local').start,'2026-07-04T21:00:00-04:00');
 const noZone=extractEvents(page({...base,startDate:'2026-07-04T21:00'},{...base,name:'Kept',startDate:'2026-07-04T21:00:00+01:00'}),{...opts,timeZone:''});
 assert.deepEqual(noZone.skipped,{badDate:1});assert.equal(noZone.events[0].start,'2026-07-04T21:00:00+01:00');
});
test('malformed JSON-LD and junk values are counted, not thrown',()=>{
 const r=extractEvents(page('{not json',{...base,name:''},{...base,startDate:'soon'},{...base,endDate:'2026-11-13T20:00:00-05:00'},{'@type':'Event'}),opts);
 assert.equal(r.events.length,0);assert.deepEqual(r.skipped,{invalidJson:1,malformed:2,badDate:2});
 assert.deepEqual(extractEvents('',opts),{events:[],skipped:{}});assert.deepEqual(extractEvents(null,opts).events,[]);
 assert.equal(jsonLdBlocks('<script type=application/ld+json>{"a":1}</script><script type="text/javascript">{}</script>').length,1);
 const x=extractEvents(page({...base,name:'<b>Bold</b> &amp; loud',url:'javascript:alert(1)'}),{...opts,baseUrl:''});assert.equal(x.events[0].title,'Bold & loud');assert.equal(x.events[0].url,'');
});
test('private, loopback and non-http targets are refused before any request',async()=>{
 for(const ip of ['127.0.0.1','10.1.2.3','172.20.0.1','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','::1','fd00::1','fe80::1','::ffff:127.0.0.1','::ffff:7f00:1']) assert.equal(isPrivateAddress(ip),true,ip);
 assert.equal(isPrivateAddress('93.184.216.34'),false);assert.equal(isPrivateAddress('2606:4700::1111'),false);
 const lookup=async host=>host==='inside.test'?[{address:'10.0.0.5'}]:[{address:'93.184.216.34'}];
 for(const url of ['ftp://venue.test/','file:///etc/passwd','http://localhost/','http://127.0.0.1/','http://[::1]/','http://inside.test/','http://venue.test:8080/','http://user:pw@venue.test/','http://intranet/'])
  await assert.rejects(checkPublicUrl(url,lookup),url);
 assert.equal((await checkPublicUrl('https://venue.test/events',lookup)).hostname,'venue.test');
});
test('robots.txt rules: specific agent group, longest match, Allow wins ties, wildcards and $',()=>{
 const robots='User-agent: *\nDisallow: /private\nAllow: /private/events\nDisallow: /*.ics$\n\nUser-agent: Boredone\nDisallow: /calendar/\n';
 assert.equal(robotsAllows(robots,'/calendar/x'),false);assert.equal(robotsAllows(robots,'/private/x'),true);
 assert.equal(robotsAllows(robots,'/private/x','otherbot'),false);assert.equal(robotsAllows(robots,'/private/events/1','otherbot'),true);
 assert.equal(robotsAllows(robots,'/feed.ics','otherbot'),false);assert.equal(robotsAllows(robots,'/feed.ics?x','otherbot'),true);
 assert.equal(robotsAllows('','/x'),true);assert.equal(robotsAllows('User-agent: *\nDisallow:','/x'),true);
});
const lookup=async()=>[{address:'93.184.216.34'}];
const routes=map=>{const calls=[];const fetcher=async(url,init)=>{calls.push(String(url));assert.equal(init.redirect,'manual');const h=map[String(url)];if(!h)return new Response('',{status:404});return typeof h==='function'?h(init):h.clone();};return {fetcher,calls};};
test('fetcher honours robots.txt disallow and treats an unreachable robots.txt as disallow',async()=>{
 const a=routes({'https://venue.test/robots.txt':new Response('User-agent: *\nDisallow: /events'),'https://venue.test/events':new Response(page(base),{headers:{'content-type':'text/html'}})});
 await assert.rejects(fetchPublic('https://venue.test/events',{fetcher:a.fetcher,lookup}),/robots/);assert.deepEqual(a.calls,['https://venue.test/robots.txt']);
 const b=routes({'https://venue.test/robots.txt':new Response('',{status:503})});
 await assert.rejects(fetchPublic('https://venue.test/events',{fetcher:b.fetcher,lookup}),/robots/);
 const c=routes({'https://venue.test/events':new Response(page(base),{headers:{'content-type':'text/html; charset=utf-8'}})});
 const ok=await fetchPublic('https://venue.test/events',{fetcher:c.fetcher,lookup});assert.equal(extractEvents(ok.text,opts).events.length,1);
});
test('fetcher re-checks redirects, caps size, checks content type and times out',async()=>{
 const html={headers:{'content-type':'text/html'}};
 const redirect=routes({'https://venue.test/events':new Response(null,{status:302,headers:{location:'http://127.0.0.1/admin'}})});
 await assert.rejects(fetchPublic('https://venue.test/events',{fetcher:redirect.fetcher,lookup}),/Private/);
 const big=routes({'https://venue.test/events':new Response('x'.repeat(5000),html)});
 await assert.rejects(fetchPublic('https://venue.test/events',{fetcher:big.fetcher,lookup,maxBytes:1000}),/too large/);
 const declared=routes({'https://venue.test/events':new Response('x',{headers:{'content-type':'text/html','content-length':'99999999'}})});
 await assert.rejects(fetchPublic('https://venue.test/events',{fetcher:declared.fetcher,lookup}),/too large/);
 const image=routes({'https://venue.test/events':new Response('x',{headers:{'content-type':'image/png'}})});
 await assert.rejects(fetchPublic('https://venue.test/events',{fetcher:image.fetcher,lookup}),/content type/);
 const slow=routes({'https://venue.test/robots.txt':init=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason)))});
 await assert.rejects(fetchPublic('https://venue.test/events',{fetcher:slow.fetcher,lookup,timeoutMs:20}),/Timed out/);
 const loop=routes({'https://venue.test/a':new Response(null,{status:301,headers:{location:'/a'}})});
 await assert.rejects(fetchPublic('https://venue.test/a',{fetcher:loop.fetcher,lookup}),/redirects/);
});
