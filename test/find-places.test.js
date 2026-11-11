import test from "node:test";
import assert from "node:assert/strict";
import { findPlaces, findEditorial } from "../src/findPlaces.js";
const query = { lat: 51.5074, lng: -0.1278, category: "culture", radius: 1500 };
const reply = (data, ok = true) => ({ok, json: async () => data});
const area = {places: [{id:"ofm-1",name:"Actual source fixture",category:"restaurant",lat:51.5,lng:-.12}], offlineArea:true, fetchedAt:"2026-10-26T12:00:00Z",sourceUpdatedAt:"2026-10-18T00:00:00Z"};
test("a successful directory lookup does not request an offline area", async () => {
  const calls=[]; const data={places:[],providerName:"Overpass"};
  assert.deepEqual(await findPlaces(query,{fetcher:async(url)=>{calls.push(url);return reply(data);}}),data);
  assert.equal(calls.length,1); assert.ok(calls[0].startsWith('/api/discover?')); assert.ok(calls[0].includes('lng=-0.1278'));
});
test("directory outage downloads the selected real area and preserves original source dates", async () => {
  const calls=[],phases=[];
  const result=await findPlaces(query,{onPhase:p=>phases.push(p),fetcher:async url=>{calls.push(url);return url.includes('/discover?')?reply({error:"Directory unavailable"},false):reply(area);}});
  assert.deepEqual(result,{...area,discoveryFallback:true});assert.equal(calls.length,2);
  assert.equal(calls[0].split('?')[1],calls[1].split('?')[1]);assert.equal(phases.length,2);
});
test("slow live request is aborted before the bounded fallback starts", async () => {
  let liveSignal;const calls=[];
  const result=await findPlaces(query,{liveTimeoutMs:5,fetcher:async(url,{signal})=>{
    calls.push(url);if(url.includes('/discover?')){liveSignal=signal;return new Promise(()=>{});}
    assert.equal(liveSignal.aborted,true);return reply(area);
  }});
  assert.equal(calls.length,2);assert.equal(result.offlineArea,true);
});
test("changing the query cancels the old request without a fallback download", async () => {
  const controller=new AbortController();let calls=0;
  const promise=findPlaces(query,{signal:controller.signal,fetcher:async()=>{calls++;controller.abort();return new Promise(()=>{});}});
  await assert.rejects(promise,{name:"AbortError"});assert.equal(calls,1);
});
test("explicit area action skips live lookup and cancellation aborts area transfer", async () => {
  const controller=new AbortController();let areaSignal;
  await assert.rejects(findPlaces(query,{areaOnly:true,signal:controller.signal,fetcher:async(url,{signal})=>{assert.ok(url.startsWith('/api/offline-area?'));areaSignal=signal;controller.abort();return new Promise(()=>{});}}),{name:"AbortError"});
  assert.equal(areaSignal.aborted,true);
});
test("both services failing returns an actionable error, never fictional results", async () => {
  await assert.rejects(findPlaces(query,{fetcher:async()=>reply({error:"private upstream detail"},false)}),/saved places are still here/);
  await assert.rejects(findPlaces(query,{areaOnly:true,areaTimeoutMs:5,fetcher:async()=>new Promise(()=>{})}),/smaller radius/);
});

test('malformed successful responses fall back instead of crashing the map',async()=>{
 const result=await findPlaces(query,{fetcher:async url=>reply(url.includes('/discover?')?{places:[{name:'Incomplete'}]}:area)});
 assert.equal(result.discoveryFallback,true);
 await assert.rejects(findPlaces(query,{fetcher:async()=>reply({places:null})}),/couldn’t update/);
});
test('editorial timeout aborts transfer without changing the base guide',async()=>{
 let signal;
 await assert.rejects(findEditorial({city:'Columbus'},{timeoutMs:5,fetcher:async(_url,options)=>{signal=options.signal;return new Promise(()=>{});}}),{name:'TimeoutError'});
 assert.equal(signal.aborted,true);
});
test('editorial cancellation and malformed output are rejected',async()=>{
 const controller=new AbortController();
 await assert.rejects(findEditorial({city:'Columbus'},{signal:controller.signal,fetcher:async()=>{controller.abort();return new Promise(()=>{});}}),{name:'AbortError'});
 await assert.rejects(findEditorial({city:'Columbus'},{fetcher:async()=>reply({places:[{id:'bad',name:'Bad',category:'bar',lat:200,lng:0}]})}),/unreadable/);
});
