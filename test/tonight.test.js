import test from 'node:test';
import assert from 'node:assert/strict';
import {TONIGHT_KEY,MAX_TONIGHT,tonightReset,readTonight,toggleTonight} from '../src/tonight.js';
const fake=()=>{const values=new Map([['journal','untouched']]);return {values,getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};};
const place={id:'a',name:'A restaurant',category:'restaurant',lat:40,lng:-80};
test('Tonight persists and toggles once per place without touching the journal',()=>{
 const storage=fake(),now=new Date(2026,9,28,21);
 assert.equal(toggleTonight(storage,place,now).places.length,1);
 assert.equal(readTonight(storage,new Date(2026,9,29,2)).places[0].id,'a');
 assert.equal(toggleTonight(storage,place,now).places.length,0);
 assert.equal(storage.values.get('journal'),'untouched');
});
test('Tonight resets at local 5 am across midnight without expiring permanent data',()=>{
 const storage=fake();toggleTonight(storage,place,new Date(2026,9,28,21));
 assert.equal(readTonight(storage,new Date(2026,9,29,4,59)).places.length,1);
 assert.equal(readTonight(storage,new Date(2026,9,29,5)).places.length,0);
 assert.equal(new Date(tonightReset(new Date(2026,9,29,5))).getDate(),30);
 assert.equal(storage.values.get('journal'),'untouched');
});
test('malformed Tonight data is ignored and failed writes do not report saved',()=>{
 const storage=fake();storage.setItem(TONIGHT_KEY,'invalid');assert.deepEqual(readTonight(storage).places,[]);
 storage.setItem=()=>{throw Error('quota')};assert.throws(()=>toggleTonight(storage,place),/quota/);
});
test('Tonight has a bounded collection while removal remains possible',()=>{
 const storage=fake(),now=new Date();storage.setItem(TONIGHT_KEY,JSON.stringify({expiresAt:tonightReset(now),places:Array.from({length:MAX_TONIGHT},(_,i)=>({...place,id:String(i)}))}));
 assert.throws(()=>toggleTonight(storage,place,now),/Tonight is full/);
 assert.equal(toggleTonight(storage,{...place,id:'0'},now).places.length,MAX_TONIGHT-1);
});
