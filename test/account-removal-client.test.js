import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createAccountRemoval} from '../src/accountRemoval.js';
function setup(){
 const owner=randomUUID(),other=randomUUID(),records=new Map(),erased=[],calls=[],events=[];
 let current=owner,complete=false,failStart=false,wrongReceipt=false;
 const storage={
  async readAccountRemoval(id){return records.get(id)||null;},async listAccountRemovals(){return [...records.values()].filter(r=>r.phase!=='removed');},
  async requestAccountRemoval(id,requestId){if(!records.has(id))records.set(id,{owner:id,requestId,phase:'requested'});return records.get(id);},
  async acceptAccountRemoval(id,expected,requestId){const r=records.get(id);assert.equal(r.requestId,expected);r.requestId=requestId;r.phase='pending';return {...r};},
  async eraseAccountJournal(id,requestId){assert.equal(records.get(id).requestId,requestId);erased.push(id);records.get(id).phase='removed';return {...records.get(id)};}
 };
 const fetch=async(url,options)=>{
  assert.equal(url,'/api/account-removal');assert.equal(options.cache,'no-store');assert.equal(options.credentials,'omit');const body=JSON.parse(options.body);calls.push(body);
  if(body.action==='status'){assert.equal(options.headers.Authorization,undefined);if(!complete&&records.get(body.owner)?.phase==='requested')return Response.json({error:'receipt_not_found'},{status:404});}
  else assert.equal(options.headers.Authorization,`Bearer fixture-token-${owner}`);
  if(body.action==='start'&&failStart)throw new TypeError('fixture outage');
  if(body.action==='continue')complete=true;
  return Response.json({status:complete?'complete':'pending',requestId:wrongReceipt?randomUUID():body.requestId});
 };
 const client=createAccountRemoval({storage,fetch,getSession:async()=>current?{user:{id:current},access_token:`fixture-token-${current}`}:null,onChange:r=>events.push({...r})});
 return {owner,other,records,erased,calls,events,storage,fetch,client,setCurrent:v=>current=v,setComplete:v=>complete=v,setFail:v=>failStart=v,setWrong:v=>wrongReceipt=v};
}
test('explicit removal persists intent before HTTP work and erases only after confirmation',async()=>{
 const p=setup();try{await assert.rejects(()=>p.client.start(p.owner,'yes'));assert.equal(p.records.size,0);const result=await p.client.start(p.owner,'DELETE');assert.equal(result.phase,'removed');assert.deepEqual(p.calls.map(c=>c.action),['start','continue']);assert.deepEqual(p.erased,[p.owner]);assert.deepEqual(p.events.map(e=>e.phase),['requested','pending','pending','removed']);}finally{p.client.close();}
});
test('wrong-account session never freezes or removes the requested journal',async()=>{
 const p=setup();p.setCurrent(p.other);try{await assert.rejects(()=>p.client.start(p.owner,'DELETE'),{code:'sign_in_required'});assert.equal(p.records.size,0);assert.equal(p.calls.length,0);}finally{p.client.close();}
});
test('failed start retains recoverable intent; resume recovers it without replacing its receipt',async()=>{
 const p=setup();try{p.setFail(true);await assert.rejects(()=>p.client.start(p.owner,'DELETE'));const id=p.records.get(p.owner).requestId;assert.equal(p.records.get(p.owner).phase,'requested');assert.deepEqual(p.erased,[]);p.setFail(false);await p.client.resume(p.owner);assert.equal(p.records.get(p.owner).requestId,id);assert.deepEqual(p.erased,[p.owner]);}finally{p.client.close();}
});
test('completion can clean the requested account after sign-out without touching another account',async()=>{
 const p=setup();try{await p.storage.requestAccountRemoval(p.owner,randomUUID());await p.storage.requestAccountRemoval(p.other,randomUUID());p.setComplete(true);p.setCurrent(null);const result=await p.client.resume(p.owner);assert.equal(result.phase,'removed');assert.deepEqual(p.erased,[p.owner]);assert.equal(p.records.get(p.other).phase,'requested');assert.deepEqual(p.calls.map(c=>c.action),['status']);}finally{p.client.close();}
});
test('a mismatched completion receipt never erases local photos',async()=>{
 const p=setup();try{await p.storage.requestAccountRemoval(p.owner,randomUUID());p.setComplete(true);p.setWrong(true);await assert.rejects(()=>p.client.resume(p.owner));assert.deepEqual(p.erased,[]);}finally{p.client.close();}
});
test('delayed session lookup cannot start removal after its deadline',async()=>{
 const p=setup();let release;const client=createAccountRemoval({storage:p.storage,fetch:p.fetch,timeoutMs:5,getSession:()=>new Promise(r=>release=r)});
 try{await assert.rejects(()=>client.start(p.owner,'DELETE'));release({user:{id:p.owner},access_token:'fixture'});await new Promise(r=>setImmediate(r));assert.equal(p.records.size,0);assert.equal(p.calls.length,0);}finally{client.close();p.client.close();}
});
test('closing during a late status response prevents local erase',async()=>{
 const p=setup();await p.storage.requestAccountRemoval(p.owner,randomUUID());let release,entered;const ready=new Promise(r=>entered=r);
 const client=createAccountRemoval({storage:p.storage,getSession:async()=>null,fetch:async()=>{entered();await new Promise(r=>release=r);return Response.json({status:'complete',requestId:p.records.get(p.owner).requestId});}});
 const request=client.resume(p.owner);const rejected=assert.rejects(()=>request);await ready;client.close();release();await rejected;await new Promise(r=>setImmediate(r));assert.deepEqual(p.erased,[]);p.client.close();
});

test('a failed session refresh gives a recoverable removal message rather than the SDK transport error',async()=>{
  const client=createAccountRemoval({getSession:async()=>{throw Error('Failed to fetch');}});
  try{await assert.rejects(()=>client.start('12345678-1234-4234-8234-123456789abc','DELETE'),/Removal paused.*device copy/);}finally{client.close();}
});
