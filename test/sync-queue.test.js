import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {blankAccount,contentFromOuting,saveDesired,claimJob,acknowledgeJob,failJob,receiveRemote,resolveConflict,validateAccount} from '../src/syncQueue.js';
const owner=randomUUID(), other=randomUUID();
const outing={id:'legacy / __proto__',place:{id:'osm/123',name:'Dinner'},status:'visited',planDate:'',visitDate:'2026-01-01',notes:'',with:'Sam',rating:0,createdAt:'2026-01-01T18:00:00.000Z',updatedAt:'2026-01-01T18:00:00.000Z',photos:[]};
const entry=o=>contentFromOuting(o,[]);
const remote=(job,overrides={})=>({user_id:owner,id:job.visitId,revision:job.expectedRevision+1,mutation_id:job.id,payload:job.content?.payload??null,photo_ids:job.content?.photoIds??[],deleted:!job.content,...overrides});
const initial=()=>saveDesired(blankAccount(owner),[entry(outing)]);

test('an account starts empty; queued saves retain stable IDs across reload/retry',()=>{
  assert.deepEqual(blankAccount(owner).records,[]);
  const first=claimJob(initial()),retry=claimJob(structuredClone(first.state));
  assert.deepEqual(retry.job,first.job);
  const failed=failJob(first.state,first.job.id,'offline');
  assert.equal(claimJob(failed).job.id,first.job.id);
  assert.equal(acknowledgeJob(failed,first.job.id,remote(first.job)).records[0].job,null);
});
test('editing during an upload preserves the in-flight snapshot and queues the newer save after ack',()=>{
  const first=claimJob(initial());
  const edited=saveDesired(first.state,[entry({...outing,notes:'Phone edit'})]);
  assert.equal(claimJob(edited).job.content.payload.notes,'');
  const acked=acknowledgeJob(edited,first.job.id,remote(first.job));
  const next=claimJob(acked).job;
  assert.equal(next.content.payload.notes,'Phone edit');assert.equal(next.expectedRevision,1);assert.notEqual(next.id,first.job.id);
  assert.equal(acked.revision,edited.revision);
  assert.deepEqual(acknowledgeJob(acked,first.job.id,remote(first.job)),acked);
});
test('an unattempted create can be canceled; an uncertain create must be acknowledged then deleted',()=>{
  assert.equal(saveDesired(initial(),[]).records.length,0);
  const first=claimJob(initial()),removed=saveDesired(first.state,[]);
  assert.equal(removed.records[0].desired,null);assert.ok(removed.records[0].job.content);
  const after=acknowledgeJob(removed,first.job.id,remote(first.job));
  assert.equal(after.records[0].job.content,null);assert.equal(after.records[0].job.expectedRevision,1);
});
test('foreign or mismatched acknowledgements cannot clear local photos or pending work',()=>{
  const first=claimJob(initial());
  assert.throws(()=>acknowledgeJob(first.state,first.job.id,remote(first.job,{user_id:other})),/Invalid account response/);
  assert.throws(()=>acknowledgeJob(first.state,first.job.id,remote(first.job,{revision:9})),/did not match/);
  assert.throws(()=>acknowledgeJob(first.state,first.job.id,remote(first.job,{payload:{...first.job.content.payload,notes:'different'}})),/did not match/);
  assert.ok(first.state.records[0].job);
});
test('remote conflicts retain local edits; keep-both preserves both versions with a new local identity',()=>{
  const first=claimJob(initial());
  const response=remote(first.job,{mutation_id:randomUUID(),revision:2,payload:{...first.job.content.payload,notes:'Laptop'}});
  const conflict=receiveRemote(first.state,response);
  assert.equal(conflict.records[0].desired.payload.notes,'');assert.equal(claimJob(conflict).job,null);
  const resolved=resolveConflict(conflict,outing.id,'keep-both');
  assert.equal(resolved.records.length,2);assert.equal(resolved.records[0].desired.payload.notes,'Laptop');
  assert.equal(resolved.records[1].desired.payload.notes,'');assert.notEqual(resolved.records[1].id,outing.id);assert.equal(resolved.records[1].job.expectedRevision,0);
});
test('remote deletion conflicts with local work rather than discarding it; clean replicas accept tombstones',()=>{
  const first=claimJob(initial()),del=remote(first.job,{mutation_id:randomUUID(),revision:2,payload:null,photo_ids:[],deleted:true});
  const conflicted=receiveRemote(first.state,del);
  assert.ok(conflicted.records[0].desired);assert.equal(conflicted.records[0].conflict.content,null);
  const acknowledged=acknowledgeJob(first.state,first.job.id,remote(first.job));
  assert.equal(receiveRemote(acknowledged,del).records[0].desired,null);
  const copy=resolveConflict(conflicted,outing.id,'keep-both');assert.equal(copy.records[0].desired,null);assert.ok(copy.records[1].desired);
});
test('a newer known remote conflict is not erased by a delayed successful response',()=>{
  const first=claimJob(initial()),later=remote(first.job,{mutation_id:randomUUID(),revision:2,payload:{...first.job.content.payload,notes:'Newer'}});
  const state=receiveRemote(first.state,later);
  assert.deepEqual(acknowledgeJob(state,first.job.id,remote(first.job)),state);
});
test('a pull can acknowledge a lost response; out-of-order pulls never roll back newer records',()=>{
  const first=claimJob(initial()),acked=receiveRemote(first.state,remote(first.job));
  assert.equal(acked.records[0].job,null);
  const newer=receiveRemote(acked,remote(first.job,{revision:3,mutation_id:randomUUID(),payload:{...first.job.content.payload,notes:'Latest'}}));
  assert.deepEqual(receiveRemote(newer,remote(first.job)),newer);
});
test('legacy hostile-looking IDs are data, not object keys, and partial photo metadata is rejected',()=>{
  const state=saveDesired(blankAccount(owner),[entry({...outing,id:'__proto__'}),entry({...outing,id:'constructor'})]);
  assert.equal(state.records.length,2);assert.equal({}.polluted,undefined);
  assert.throws(()=>validateAccount(state,other),/could not be read/);
  const broken=structuredClone(state);broken.records[0].desired.photoIds=[randomUUID()];
  assert.throws(()=>validateAccount(broken,owner),/metadata is missing/);
});
test('cloud calendar dates survive reading across the date line while new future visits are rejected',()=>{
  const date=new Date();date.setDate(date.getDate()+1);const tomorrow=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const first=claimJob(initial()),response=remote(first.job,{payload:{...first.job.content.payload,visitDate:tomorrow}});
  const state=receiveRemote(blankAccount(owner),response);
  assert.equal(state.records[0].desired.payload.visitDate,tomorrow);
  assert.throws(()=>contentFromOuting({...outing,visitDate:tomorrow},[]),/future date/);
  assert.equal(contentFromOuting({...outing,visitDate:tomorrow},[],true).content.payload.visitDate,tomorrow);
});
test('incomplete persisted queue records fail closed instead of becoming a blank journal',()=>{
  const missing=initial();delete missing.records[0].desired;
  assert.throws(()=>validateAccount(missing,owner),/Incomplete account visit/);
  const broken=initial();delete broken.records[0].job.content;
  assert.throws(()=>validateAccount(broken,owner),/Incomplete pending save/);
});
test('a confirmed or uncertain deletion cannot be undone by reusing its retired identity',()=>{
  const first=claimJob(initial()),acked=acknowledgeJob(first.state,first.job.id,remote(first.job));
  const removed=saveDesired(acked,[]);
  assert.equal(saveDesired(removed,[entry(outing)]).records[0].job,null); // Undo before sending is safe.
  const deletion=claimJob(removed);
  assert.throws(()=>saveDesired(deletion.state,[entry(outing)]),/separate visit/);
  const deleted=acknowledgeJob(deletion.state,deletion.job.id,remote(deletion.job));
  assert.throws(()=>saveDesired(deleted,[entry(outing)]),/separate visit/);
});
test('cleanup candidates survive acknowledgement and do not erase a photo still referenced locally',()=>{
  const image={id:randomUUID(),sha256:'a'.repeat(64),mimeType:'image/jpeg',byteSize:100};
  const content={payload:entry(outing).content.payload,photoIds:[image.id]};
  let state=saveDesired(blankAccount(owner),[{id:outing.id,content}],[image]);
  const first=claimJob(state);state=acknowledgeJob(first.state,first.job.id,remote(first.job));
  const removing=claimJob(saveDesired(state,[]));
  const deleted=acknowledgeJob(removing.state,removing.job.id,remote(removing.job));
  assert.deepEqual(deleted.cleanup,[image.id]);assert.equal(deleted.records[0].desired,null);
});
test('verified asset receipts survive local edits, and unfailed jobs precede already failed ones',()=>{
  const image={id:randomUUID(),sha256:'a'.repeat(64),mimeType:'image/jpeg',byteSize:100,verified:true};
  const content={payload:entry(outing).content.payload,photoIds:[image.id]};
  let state=saveDesired(blankAccount(owner),[{id:outing.id,content}],[image]);
  state=saveDesired(state,[{id:outing.id,content:{...content,payload:{...content.payload,notes:'edit'}}}],[{...image,verified:false}]);
  assert.equal(state.assets[0].verified,true);
  const claimed=claimJob(state);state=failJob(claimed.state,claimed.job.id,'quota');
  state=saveDesired(state,[{id:outing.id,content:state.records[0].desired},entry({...outing,id:'new plan'})]);
  assert.equal(claimJob(state).job.visitId,'new plan');
});
test('only positive retirement evidence can replace an attempted photo identity',async()=>{
  const {replaceRetiredJob}=await import('../src/syncQueue.js');
  const image={id:randomUUID(),sha256:'a'.repeat(64),mimeType:'image/jpeg',byteSize:100,verified:true};
  const content={payload:entry(outing).content.payload,photoIds:[image.id]};
  const first=claimJob(saveDesired(blankAccount(owner),[{id:outing.id,content}],[image]));
  assert.throws(()=>replaceRetiredJob(first.state,first.job.id,{visitRevision:1,assets:[{id:image.id,state:'deleted'}]}),/not been confirmed/);
  assert.throws(()=>replaceRetiredJob(first.state,first.job.id,{visitRevision:0,assets:[{id:image.id,state:'ready'}]}),/not been confirmed/);
  const replacement=replaceRetiredJob(first.state,first.job.id,{visitRevision:0,assets:[{id:image.id,state:'deleted'}]});
  const next=claimJob(replacement.state).job;
  assert.notEqual(next.id,first.job.id);assert.notEqual(next.content.photoIds[0],image.id);assert.equal(next.expectedRevision,0);
  assert.equal(replacement.state.assets.find(a=>a.id===next.content.photoIds[0]).verified,false);
  assert.deepEqual(replacement.state.cleanup,[image.id]);assert.equal(replacement.state.revision,first.state.revision+1);
});
