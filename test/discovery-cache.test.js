import test from "node:test";
import assert from "node:assert/strict";
import {discoveryKey,readDiscovery,saveDiscovery,clearDiscoveryCache,FRESH_MS,RETAIN_MS} from "../src/discoveryCache.js";
const area={name:"Pittsburgh",label:"Pittsburgh, PA",lat:40.44062,lng:-79.99589};
const result={places:[{id:"osm-node-1",name:"Real source fixture",lat:40.44,lng:-80}],center:{lat:40.44,lng:-80},radius:1500,category:"culture",fetchedAt:"2026-10-23T12:00:00Z",providerName:"Test provider",stale:false};
const now=Date.parse(result.fetchedAt);
const storage=()=>{const data=new Map();return{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}};
test("public cache persists exact queries, preserves timestamps and expires without refresh",()=>{
  const s=storage(), key=discoveryKey(area,1500,"culture");
  assert.equal(saveDiscovery(area,result,s,now),true);
  assert.equal(readDiscovery(key,s,now+1).result.stale,false);
  assert.equal(readDiscovery(key,s,now+FRESH_MS).result.stale,true);
  assert.equal(readDiscovery(key,s,now+FRESH_MS).result.fetchedAt,result.fetchedAt);
  assert.equal(readDiscovery(discoveryKey(area,3000,"food"),s,now),null);
  assert.equal(readDiscovery(key,s,now+RETAIN_MS),null);
});
test("cache safely ignores malformed/blocked storage and never stores sample results",()=>{
  const s=storage(); assert.equal(saveDiscovery(area,{...result,sample:true},s,now),false); assert.equal(readDiscovery(null,s,now),null);
  s.setItem("boredone-discovery-v1","not JSON"); assert.equal(readDiscovery(null,s,now),null);
  const blocked={getItem:()=>{throw Error()},setItem:()=>{throw Error()}};
  assert.equal(readDiscovery(null,blocked,now),null); assert.equal(saveDiscovery(area,result,blocked,now),false);
  saveDiscovery(area,result,s,now);clearDiscoveryCache(s);assert.equal(readDiscovery(null,s,now),null);
});
test("cache is bounded to twelve searches with newest first",()=>{
  const s=storage();for(let i=0;i<15;i++)saveDiscovery({...area,lat:i},{...result,center:{lat:i,lng:-80}},s,now);
  assert.equal(readDiscovery(null,s,now).area.lat,14);
  assert.equal(readDiscovery(discoveryKey({...area,lat:0},1500,"culture"),s,now),null);
});
test("explicit area download survives a day with original dataset dates, but expires after thirty days",()=>{
  const s=storage(), areaResult={...result,offlineArea:true,sourceUpdatedAt:"2026-10-18T00:00:00.000Z"};
  saveDiscovery(area,areaResult,s,now);
  const saved=readDiscovery(null,s,now+2*RETAIN_MS);
  assert.equal(saved.result.sourceUpdatedAt,areaResult.sourceUpdatedAt);
  assert.equal(saved.result.fetchedAt,areaResult.fetchedAt);
  assert.equal(saved.result.stale,true);
  assert.equal(readDiscovery(null,s,now+30*RETAIN_MS),null);
});
test('expanded guides and their photo provenance survive a cache round-trip',()=>{
 const s=storage(),places=Array.from({length:650},(_,i)=>({id:'venue-'+i,name:'Venue '+i,lat:40.44,lng:-80,photo:{url:'/guide-photos/photo.jpg',author:'Author',license:'CC0'}}));
 saveDiscovery(area,{...result,places},s,now);const restored=readDiscovery(null,s,now);assert.equal(restored.result.places.length,650);assert.equal(restored.result.places[649].photo.author,'Author');
});
