import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {parseICal,unfold,unescapeText,parseLine,parseDuration,parseRrule} from '../server/events/ical.js';
import {zonedToMs,isoInZone,parseOffsetIso,resolveTimeZone} from '../server/events/time.js';
const NY='America/New_York',ms=s=>Date.parse(s);
const cal=(body,head='')=>`BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${head}${body}END:VCALENDAR\r\n`;
const ev=lines=>`BEGIN:VEVENT\r\nUID:${Math.random()}\r\nSUMMARY:Show\r\n${lines.join('\r\n')}\r\nEND:VEVENT\r\n`;
const win={from:ms('2026-01-01T00:00:00Z'),to:ms('2027-01-01T00:00:00Z'),sourceUrl:'https://feed.test/cal.ics',sourceName:'Feed',fetchedAt:'2026-11-11T00:00:00Z'};
const one=(lines,opts={})=>parseICal(cal(ev(lines),opts.head||''),{...win,...opts});

test('America/New_York wall times: normal, spring-forward gap and fall-back repeat follow RFC 5545',()=>{
 assert.equal(new Date(zonedToMs({y:2026,mo:11,d:13,h:20},NY)).toISOString(),'2026-11-14T01:00:00.000Z');
 assert.equal(new Date(zonedToMs({y:2026,mo:7,d:3,h:20},NY)).toISOString(),'2026-07-04T00:00:00.000Z');
 // 02:30 does not exist on 8 March 2026: read with the offset before the gap -> 03:30 EDT.
 assert.equal(isoInZone(zonedToMs({y:2026,mo:3,d:8,h:2,mi:30},NY),NY),'2026-03-08T03:30:00-04:00');
 // 01:30 happens twice on 1 November 2026: the first (EDT) wins.
 assert.equal(isoInZone(zonedToMs({y:2026,mo:11,d:1,h:1,mi:30},NY),NY),'2026-11-01T01:30:00-04:00');
 assert.equal(isoInZone(ms('2026-11-01T06:30:00Z'),NY),'2026-11-01T01:30:00-05:00');
 assert.equal(parseOffsetIso('2026-11-13T20:00'),null);assert.equal(parseOffsetIso('2026-02-30T20:00:00Z'),null);assert.equal(parseOffsetIso('2026-11-13T20:00:00-0500').ms,ms('2026-11-14T01:00:00Z'));
 assert.equal(resolveTimeZone('/freeassociation.sourceforge.net/America/New_York'),NY);assert.equal(resolveTimeZone('Eastern Standard Time'),'');
});
test('content lines: unfolding, escaped text and quoted parameter values',()=>{
 assert.equal(unfold('SUMMARY:Jazz at\r\n  the Bar\r\nX:1'),'SUMMARY:Jazz at the Bar\nX:1');
 assert.equal(unescapeText('A\\, B\\; C\\nD\\\\E'),'A, B; C\nD\\E');
 assert.deepEqual(parseLine('LOCATION;ALTREP="https://x.test/a:b";LANGUAGE=en:Hall: Main'),{name:'LOCATION',params:{ALTREP:'https://x.test/a:b',LANGUAGE:'en'},value:'Hall: Main'});
 const r=one(['DTSTART:20261114T010000Z','SUMMARY:x','LOCATION:Thunderbird Music Hall\\, 4053 Butler St\\, Pittsburgh','GEO:40.4695;-79.9617','URL:https://venue.test/show']);
 assert.equal(r.events[0].venueName,'Thunderbird Music Hall');assert.equal(r.events[0].lat,40.4695);assert.equal(r.events[0].url,'https://venue.test/show');
 const folded=parseICal('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Very long\r\n  title\r\nDTSTART;TZID=America/New_Yo\r\n rk:20261113T200000\r\nEND:VEVENT\r\nEND:VCALENDAR',win);
 assert.equal(folded.events[0].title,'Very long title');assert.equal(folded.events[0].start,'2026-11-13T20:00:00-05:00');
});
test('DTSTART forms: UTC, TZID (incl. prefixed), floating with calendar zone, and unknown zones are skipped',()=>{
 assert.equal(one(['DTSTART:20261114T010000Z'],{timeZone:NY}).events[0].start,'2026-11-13T20:00:00-05:00');
 assert.equal(one(['DTSTART:20261114T010000Z']).events[0].start,'2026-11-14T01:00:00+00:00');
 assert.equal(one(['DTSTART;TZID=/freeassociation.sourceforge.net/America/New_York:20260704T210000']).events[0].start,'2026-07-04T21:00:00-04:00');
 assert.equal(one(['DTSTART:20261113T200000'],{head:'X-WR-TIMEZONE:America/New_York\r\n'}).events[0].start,'2026-11-13T20:00:00-05:00');
 assert.equal(one(['DTSTART:20261113T200000'],{timeZone:NY}).events[0].start,'2026-11-13T20:00:00-05:00');
 const floating=one(['DTSTART:20261113T200000']);assert.equal(floating.events.length,0);assert.equal(floating.skipped.unknownTimeZone,1);
 const mars=one(['DTSTART;TZID=Mars/Olympus_Mons:20261113T200000']);assert.equal(mars.events.length,0);assert.equal(mars.skipped.unknownTimeZone,1);
});
test('all-day events cover the local day, including the day the clocks change',()=>{
 const r=one(['DTSTART;VALUE=DATE:20261101'],{timeZone:NY});
 assert.equal(r.events[0].start,'2026-11-01T00:00:00-04:00');assert.equal(r.events[0].end,'2026-11-02T00:00:00-05:00');assert.equal(r.events[0].allDay,true);
 assert.equal(one(['DTSTART;TZID=America/New_York:20261113T200000'],{timeZone:NY}).events[0].allDay,false);
 const multi=one(['DTSTART;VALUE=DATE:20261113','DTEND;VALUE=DATE:20261116'],{timeZone:NY});assert.equal(multi.events[0].end,'2026-11-16T00:00:00-05:00');
 assert.equal(one(['DTSTART;VALUE=DATE:20261113']).skipped.unknownTimeZone,1);
});
test('DTEND and DURATION: exact hours, nominal days across DST, and bad values are counted',()=>{
 assert.equal(one(['DTSTART;TZID=America/New_York:20261113T200000','DURATION:PT2H30M']).events[0].end,'2026-11-13T22:30:00-05:00');
 assert.equal(one(['DTSTART;TZID=America/New_York:20261031T200000','DURATION:P1D']).events[0].end,'2026-11-01T20:00:00-05:00');
 assert.equal(one(['DTSTART;TZID=America/New_York:20261113T200000','DTEND:20261114T040000Z']).events[0].end,'2026-11-13T23:00:00-05:00');
 assert.deepEqual(parseDuration('P1W'),{days:7,seconds:0});assert.equal(parseDuration('P'),null);assert.equal(parseDuration('1H'),null);
 assert.equal(one(['DTSTART;TZID=America/New_York:20261113T200000','DURATION:soon']).skipped.badDate,1);
 assert.equal(one(['DTSTART;TZID=America/New_York:20261113T200000','DTEND;TZID=America/New_York:20261113T190000']).skipped.badDate,1);
});
test('cancelled, online and malformed entries are skipped and counted, never shown',()=>{
 const r=parseICal(cal(ev(['DTSTART:20261114T010000Z','STATUS:CANCELLED'])+ev(['DTSTART:20261114T010000Z','LOCATION:Virtual'])+ev(['DTSTART:20261340T010000Z'])+'BEGIN:VEVENT\r\nSUMMARY:No start\r\nEND:VEVENT\r\n'+ev(['DTSTART:20261114T010000Z','STATUS:CONFIRMED'])),win);
 assert.equal(r.events.length,1);assert.deepEqual(r.skipped,{cancelled:1,online:1,badDate:1,malformed:1});
 assert.throws(()=>parseICal('<html>not a calendar</html>',win),/Not an iCalendar/);assert.throws(()=>parseICal('',win));
});
test('weekly BYDAY recurrence keeps the local start time across the November DST change and respects COUNT and the window',()=>{
 const r=one(['DTSTART;TZID=America/New_York:20261023T190000','DTEND;TZID=America/New_York:20261023T220000','RRULE:FREQ=WEEKLY;BYDAY=FR;COUNT=4'],{from:ms('2026-10-30T00:00:00Z'),to:ms('2026-12-31T00:00:00Z')});
 assert.deepEqual(r.events.map(e=>e.start),['2026-10-30T19:00:00-04:00','2026-11-06T19:00:00-05:00','2026-11-13T19:00:00-05:00']);
 assert.equal(r.events[1].end,'2026-11-06T22:00:00-05:00');assert.equal(new Set(r.events.map(e=>e.id)).size,3);
 const twice=one(['DTSTART;TZID=America/New_York:20261102T180000','RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;UNTIL=20261201T000000Z'],{from:ms('2026-11-01T00:00:00Z'),to:ms('2026-12-31T00:00:00Z')});
 assert.deepEqual(twice.events.map(e=>e.start.slice(0,10)),['2026-11-02','2026-11-05','2026-11-16','2026-11-19','2026-11-30']);
});
test('daily recurrence with INTERVAL and UNTIL, EXDATE and RECURRENCE-ID overrides',()=>{
 const r=parseICal(cal(`BEGIN:VEVENT\r\nUID:series\r\nSUMMARY:Trivia\r\nDTSTART;TZID=America/New_York:20261110T200000\r\nRRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20261119T120000Z\r\nEXDATE;TZID=America/New_York:20261112T200000\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:series\r\nRECURRENCE-ID;TZID=America/New_York:20261114T200000\r\nSUMMARY:Trivia (late)\r\nDTSTART;TZID=America/New_York:20261114T210000\r\nEND:VEVENT\r\n`),win);
 assert.deepEqual(r.events.map(e=>`${e.title}@${e.start}`).sort(),['Trivia (late)@2026-11-14T21:00:00-05:00','Trivia@2026-11-10T20:00:00-05:00','Trivia@2026-11-16T20:00:00-05:00','Trivia@2026-11-18T20:00:00-05:00']);
});
test('rules outside the supported subset are skipped and counted, never guessed',()=>{
 for(const rule of ['FREQ=MONTHLY;BYDAY=1FR','FREQ=WEEKLY;BYDAY=1FR','FREQ=YEARLY','FREQ=WEEKLY;BYSETPOS=1','FREQ=DAILY;COUNT=0','FREQ=DAILY;COUNT=2;UNTIL=20261201T000000Z','nonsense'])
  assert.equal(one(['DTSTART;TZID=America/New_York:20261113T200000','RRULE:'+rule]).skipped.unsupportedRule,1,rule);
 assert.deepEqual(parseRrule('FREQ=WEEKLY;BYDAY=FR,SA'),{freq:'WEEKLY',interval:1,count:null,until:null,byday:[5,6],wkst:1});
 assert.equal(one(['DTSTART;TZID=America/New_York:20261113T200000','RDATE:20261120T200000']).skipped.unsupportedRule,1);
});
test('recorded Pittsburgh feeds parse; the fixtures carry their source and fetch date',()=>{
 const shady=readFileSync(new URL('./fixtures/events/shadyave.ics',import.meta.url),'utf8'),sp=readFileSync(new URL('./fixtures/events/sustainablepittsburgh.ics',import.meta.url),'utf8');
 assert.match(shady,/X-BOREDONE-RECORDED-FROM:https:\/\/shadyave\.com\/events\/month\/\?ical=1/);assert.match(sp,/X-BOREDONE-RECORDED-AT:2026-11-12T00:03:58Z/);
 const friday={from:ms('2026-11-13T22:00:00Z'),to:ms('2026-11-14T08:00:00Z'),timeZone:NY,sourceName:'Shady Ave',sourceUrl:'https://shadyave.com/events/month/?ical=1',fetchedAt:'2026-11-12T00:03:58Z'};
 const a=parseICal(shady,friday);assert.equal(a.events.length,1);assert.equal(a.events[0].venueName,'Carnegie Museum of Art');assert.equal(a.events[0].lat,null);assert.equal(a.events[0].start,'2026-05-02T08:00:00-04:00');assert.equal(a.events[0].end,'2027-01-03T17:00:00-05:00');
 const b=parseICal(sp,{...friday,from:ms('2026-11-01T00:00:00Z'),to:ms('2026-12-01T00:00:00Z')});assert.equal(b.events.length,1);assert.equal(b.events[0].title,'Sustainable Pittsburgh Summit: Grounded Locally, Connected Globally');assert.equal(b.skipped.online,1);
});
