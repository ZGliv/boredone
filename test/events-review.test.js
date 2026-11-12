import test from 'node:test';import assert from 'node:assert/strict';
import {parseICal,decodeICal} from '../server/events/ical.js';
import {mergeEvents} from '../server/events/index.js';
import {checkPublicUrl,fetchPublic,isPrivateAddress} from '../server/events/jsonld.js';
const NY='America/New_York',ms=Date.parse;
const tonight={from:ms('2026-11-13T17:00:00-05:00'),to:ms('2026-11-14T04:00:00-05:00'),timeZone:NY};
const feed=(n,dtstart,rule)=>'BEGIN:VCALENDAR\r\n'+Array.from({length:n},(_,k)=>`BEGIN:VEVENT\r\nUID:${k}\r\nSUMMARY:Series ${k}\r\nDTSTART;TZID=America/New_York:${dtstart}\r\nDURATION:PT2H\r\nRRULE:${rule}\r\nEND:VEVENT`).join('\r\n')+'\r\nEND:VCALENDAR';

test('open-ended series that began years ago still reach tonight, quickly',()=>{
 const t=performance.now();
 const daily=parseICal(feed(40,'20120101T190000','FREQ=DAILY'),tonight);
 const weekly=parseICal(feed(40,'20110107T190000','FREQ=WEEKLY;BYDAY=FR'),tonight);
 const every2=parseICal(feed(1,'20180105T190000','FREQ=WEEKLY;INTERVAL=2;BYDAY=FR'),tonight);
 assert.ok(performance.now()-t<1500,'parse took '+Math.round(performance.now()-t)+' ms');
 assert.equal(daily.events.length,40);assert.deepEqual(daily.skipped,{});
 assert.equal(daily.events[0].start,'2026-11-13T19:00:00-05:00');assert.equal(daily.events[0].end,'2026-11-13T21:00:00-05:00');
 assert.equal(weekly.events.length,40);assert.equal(weekly.events[0].start,'2026-11-13T19:00:00-05:00');
 // 5 Jan 2018 + an even number of fortnights: 13 Nov 2026 is week 462 -> on the schedule.
 assert.equal(every2.events.length,1);
 const odd=parseICal(feed(1,'20180112T190000','FREQ=WEEKLY;INTERVAL=2;BYDAY=FR'),tonight);assert.equal(odd.events.length,0);
});
test('COUNT and UNTIL are still honoured for old series',()=>{
 assert.equal(parseICal(feed(1,'20150101T190000','FREQ=DAILY;COUNT=10000'),tonight).events.length,1);
 assert.equal(parseICal(feed(1,'20150101T190000','FREQ=DAILY;COUNT=500'),tonight).events.length,0);
 assert.equal(parseICal(feed(1,'20150101T190000','FREQ=DAILY;UNTIL=20200101T000000Z'),tonight).events.length,0);
 // 13 Nov 2026 is day 4335 counting 1 Jan 2015 as day 1.
 assert.equal(parseICal(feed(1,'20150101T190000','FREQ=DAILY;COUNT=4335'),tonight).events.length,1);
 assert.equal(parseICal(feed(1,'20150101T190000','FREQ=DAILY;COUNT=4334'),tonight).events.length,0);
});
test('a fold that splits a multi-byte UTF-8 character is restored before decoding',()=>{
 const e=Buffer.from('é'),bytes=Buffer.concat([Buffer.from('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:1\r\nDTSTART:20261114T003000Z\r\nSUMMARY:Caf'),e.subarray(0,1),Buffer.from('\r\n '),e.subarray(1),Buffer.from(' night \u{1F3B6}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n')]);
 assert.equal(parseICal(decodeICal(bytes),tonight).events[0].title,'Café night \u{1F3B6}');
 assert.equal(parseICal(decodeICal(Buffer.from(bytes.toString('latin1').replace(/\r\n/g,'\n'),'latin1')),tonight).events[0].title,'Café night \u{1F3B6}');
});
const E=(title,start,source='ical')=>({id:title+start+source,title,venueName:'Hall',lat:40.45,lng:-79.95,start,end:'',url:'',source,sourceName:'',placeId:'',fetchedAt:''});
test('de-duplication keeps an early and a late show at the same venue apart',()=>{
 const one=mergeEvents([[E('Comedy Night','2026-11-13T19:00:00-05:00'),E('Comedy Night','2026-11-13T19:30:00-05:00')]]);
 assert.equal(one.length,2);
 const two=mergeEvents([[E('Comedy Night','2026-11-13T19:00:00-05:00'),E('Comedy Night','2026-11-13T19:30:00-05:00')],[E('Comedy Night','2026-11-13T19:30:00-05:00','ticketmaster'),E('Comedy Night','2026-11-13T19:00:00-05:00','ticketmaster')]]);
 assert.deepEqual(two.map(e=>[e.start,e.source]),[['2026-11-13T19:00:00-05:00','ticketmaster'],['2026-11-13T19:30:00-05:00','ticketmaster']]);
 // A source listing the same show twice at the same time is still one event.
 assert.equal(mergeEvents([[E('Gala','2026-11-13T20:00:00-05:00','ticketmaster'),E('Gala','2026-11-13T20:00:00-05:00','ticketmaster')]]).length,1);
});
test('SSRF: trailing-dot localhost and IPv4-compatible IPv6 are refused',async()=>{
 const lookup=async()=>[{address:'93.184.216.34',family:4}];
 for(const u of['http://localhost./','http://[::7f00:1]/','http://[::a9fe:a9fe]/'])await assert.rejects(checkPublicUrl(u,lookup),/Private/,u);
 assert.equal(isPrivateAddress('::7f00:1'),true);assert.equal(isPrivateAddress('2606:4700::1'),false);
});
test('robots.txt behind a redirect is followed, re-checked and honoured',async()=>{
 const lookup=async h=>[{address:h==='inside.test'?'10.0.0.2':'93.184.216.34',family:4}];
 const calls=[],routes={'https://venue.test/robots.txt':()=>new Response(null,{status:301,headers:{location:'https://www.venue.test/robots.txt'}}),'https://www.venue.test/robots.txt':()=>new Response('User-agent: *\nDisallow: /events'),'https://venue.test/events':()=>new Response('<html></html>',{headers:{'content-type':'text/html'}})};
 const fetcher=async url=>{calls.push(String(url));return (routes[String(url)]||(()=>new Response('',{status:404})))();};
 await assert.rejects(fetchPublic('https://venue.test/events',{fetcher,lookup}),/robots/);
 assert.deepEqual(calls,['https://venue.test/robots.txt','https://www.venue.test/robots.txt']);
 const sneaky=async url=>String(url).endsWith('/robots.txt')?new Response(null,{status:302,headers:{location:'http://inside.test/robots.txt'}}):new Response('<html></html>',{headers:{'content-type':'text/html'}});
 await assert.rejects(fetchPublic('https://other.test/events',{fetcher:sneaky,lookup}),/Private/);
});
