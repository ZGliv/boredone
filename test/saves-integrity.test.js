// Review: data-integrity checks for saves (the Pile) across imports, merges and sync.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {validateBackup,mergeOutings,validateOuting,backupPayload,MAX_OUTINGS,MAX_SAVES} from '../src/model.js';
import {readAccountBackup} from '../src/accountBackup.js';
import {contentFromOuting,MAX_RETAINED} from '../src/syncQueue.js';
import {createCloudJournal} from '../src/cloudJournal.js';
import {makeSave,attachPlace,saveToPlan} from '../src/saves.js';
import {cloudFixture,sessionFor} from './helpers/cloud-fixture.js';

const now=new Date('2026-11-11T18:00:00.000Z');
const place={id:'osm/node/42',name:'Ramen pop-up',address:'Penn Ave',category:'restaurant',source:'OpenStreetMap',lat:40.45,lng:-79.98};
// Shaped exactly as the pre-saves app wrote them: full place, photos, no source key.
const oldRecord=i=>({id:`old-${i}`,place:{id:`osm/${i}`,name:`Old place ${i}`,address:'1 Main St',category:'museum',source:'OpenStreetMap',sourceUrl:'https://www.openstreetmap.org/node/1',website:'https://example.org/',hours:'',fee:'',access:'',lat:40.4,lng:-79.9},
  status:i%2?'visited':'planned',planDate:'',visitDate:i%2?'2026-01-02':'',notes:'Note',with:'Sam',rating:i%2?4:0,photos:[],createdAt:'2026-01-02T12:00:00.000Z',updatedAt:'2026-01-02T12:00:00.000Z'});

test('a full pre-saves backup (500 outings) imports byte-identical and without a source key',()=>{
  const outings=Array.from({length:MAX_OUTINGS},(_,i)=>oldRecord(i));
  const backup={app:'boredone',version:1,exportedAt:'2026-01-03T00:00:00.000Z',outings};
  const imported=validateBackup(JSON.parse(JSON.stringify(backup)));
  assert.deepEqual(imported,outings);
  assert.ok(imported.every(o=>!('source' in o)));
  assert.deepEqual(readAccountBackup(JSON.parse(JSON.stringify(backup))),imported);
});

test('mixed libraries: 500 memories plus 1,000 saves fit, one more of either is refused without partial merge',()=>{
  const memories=Array.from({length:MAX_OUTINGS},(_,i)=>oldRecord(i));
  const saves=Array.from({length:MAX_SAVES},(_,i)=>makeSave({url:`https://example.com/${i}`,now}));
  const full=mergeOutings(memories,saves);assert.equal(full.outings.length,1500);
  const before=JSON.stringify(full.outings);
  assert.throws(()=>mergeOutings(full.outings,[makeSave({text:'one more',now})]),/1,000 saves/);
  assert.throws(()=>mergeOutings(full.outings,[oldRecord(9999)]),/500 plans/);
  assert.equal(JSON.stringify(full.outings),before);
  assert.equal(validateBackup(JSON.parse(JSON.stringify(backupPayload({outings:full.outings})))).length,1500);
});

test('same id as a save on one device and a plan on another: the newer edit wins whole, never a hybrid',()=>{
  const save=makeSave({url:'https://www.instagram.com/reel/ABC/',now});
  const plan=saveToPlan(attachPlace(save,place,new Date('2026-11-12T00:00:00Z')),'2026-11-20',new Date('2026-11-12T00:00:01Z'));
  const a=mergeOutings([save],[plan]);assert.deepEqual(a.outings,[plan]);assert.equal(a.updated,1);
  const b=mergeOutings([plan],[save]);assert.deepEqual(b.outings,[plan]);assert.equal(b.updated,0);
  // A newer unresolved save replacing an older plan keeps its null place and passes validation.
  const later={...save,updatedAt:'2026-11-13T00:00:00.000Z'};
  const c=mergeOutings([plan],[later]);assert.equal(c.outings[0].place,null);assert.deepEqual(validateOuting(c.outings[0]),later);
});

test('sync payload for an old record is unchanged (no source key) so already-synced rows do not re-sync',()=>{
  const {content}=contentFromOuting(oldRecord(1),[]);
  assert.equal('source' in content.payload,false);
  const s=contentFromOuting(makeSave({text:'rooftop bar',now}),[]).content.payload;
  assert.equal(s.place,null);assert.equal(JSON.parse(JSON.stringify(s)).place,null);
});

test('cloud listing reads every retained row the server allows, beyond the old 1,000-row cap',async()=>{
  const owner=randomUUID(),fixture=cloudFixture(owner);
  const cloud=createCloudJournal({url:'https://bordone-fixture.supabase.co',publishableKey:'sb_publishable_fixture_only',owner,getSession:async()=>sessionFor(owner),fetch:fixture.fetch});
  const live=contentFromOuting(makeSave({text:'rooftop bar',now}),[]).content.payload;
  const put=i=>{const id=`visit-${String(i).padStart(5,'0')}`;fixture.visits.set(id,{user_id:owner,id,revision:1,mutation_id:randomUUID(),payload:i<1500?live:null,photo_ids:[],deleted:i>=1500});};
  // 1,500 live rows (500 plans/memories + 1,000 saves is legal) plus tombstones.
  for(let i=0;i<1800;i++)put(i);
  assert.equal((await cloud.listVisits()).length,1800);
  for(let i=1800;i<MAX_RETAINED;i++)put(i);
  assert.equal((await cloud.listVisits()).length,MAX_RETAINED);
  put(MAX_RETAINED);
  await assert.rejects(cloud.listVisits(),/record limit/);
  cloud.close();
});
