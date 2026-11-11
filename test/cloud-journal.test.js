import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createCloudJournal} from '../src/cloudJournal.js';
import {describePhoto} from '../src/syncPhotos.js';
import {contentFromOuting} from '../src/syncQueue.js';
import {cloudFixture,sessionFor} from './helpers/cloud-fixture.js';
const owner=randomUUID();
const dataUrl='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jMZkAAAAASUVORK5CYII=';
const photo=async()=>({...(await describePhoto(dataUrl,randomUUID())),dataUrl});
const defaultSession=sessionFor(owner);
const config={url:'https://bordone-fixture.supabase.co',publishableKey:'sb_publishable_fixture_only',owner,getSession:async()=>defaultSession};
const outing={id:'legacy / visit "quoted"',place:{id:'osm/123',name:'Visit fixture'},status:'visited',planDate:'',visitDate:'2026-01-01',notes:'Personal note',with:'Companion',rating:0,createdAt:'2026-01-01T17:00:00.000Z',updatedAt:'2026-01-01T17:00:00.000Z',photos:[]};
const job=(photoIds=[])=>({owner,visitId:outing.id,id:randomUUID(),expectedRevision:0,content:contentFromOuting({...outing,photos:photoIds.map(()=>dataUrl)},photoIds).content});
const setup=()=>{const fixture=cloudFixture(owner);return {fixture,cloud:createCloudJournal({...config,fetch:fixture.fetch})};};

test('real SDK sends fixed account credentials, raw immutable uploads, private downloads and explicit owner RPCs',async()=>{
  const {fixture,cloud}=setup(),file=await photo(),verified=await cloud.ensurePhoto(file);
  assert.equal(verified.dataUrl,dataUrl);
  const pending=job([file.id]);const saved=await cloud.saveVisit(pending);assert.equal(saved.revision,1);
  assert.equal((await cloud.getVisit(pending.visitId)).id,pending.visitId);
  assert.equal(await cloud.getVisit('missing'),null);
  assert.equal((await cloud.getAssets([file.id]))[0].id,file.id);
  for(const call of fixture.calls){
    assert.equal(call.headers.get('authorization'),`Bearer ${defaultSession.access_token}`);
    assert.equal(call.headers.get('apikey'),config.publishableKey);assert.equal(call.cache,'no-store');
    if(call.url.pathname.includes('/rpc/'))assert.equal(call.body.p_owner,owner);
    if(call.url.pathname==='/rest/v1/journal_visits'||call.url.pathname==='/rest/v1/journal_assets')assert.equal(call.url.searchParams.get('user_id'),`eq.${owner}`);
  }
  const upload=fixture.calls.find(c=>c.method==='POST'&&c.url.pathname.includes('/storage/'));
  assert.ok(upload.body instanceof ArrayBuffer);assert.equal(upload.headers.get('x-upsert'),'false');assert.equal(upload.headers.get('content-type'),'image/png');
  assert.ok(fixture.calls.some(c=>c.method==='GET'&&c.url.pathname.includes('/storage/v1/object/journal-photos-v1/')));assert.ok(fixture.calls.every(c=>!c.url.pathname.includes('/object/public/')));cloud.close();
});
test('lost upload response resumes without replacing bytes or creating another object',async()=>{
  const {fixture,cloud}=setup(),file=await photo();fixture.controls.loseUpload=true;
  await assert.rejects(cloud.ensurePhoto(file),e=>e.kind==='offline');
  assert.equal((await cloud.ensurePhoto(file)).sha256,file.sha256);
  assert.equal(fixture.calls.filter(c=>c.method==='POST'&&c.url.pathname.includes('/storage/')).length,1);
  assert.equal(fixture.objects.size,1);cloud.close();
});
test('bad local bytes never upload and bad downloaded bytes never report a verified photo',async()=>{
  const {fixture,cloud}=setup(),file=await photo();
  await assert.rejects(cloud.ensurePhoto({...file,sha256:'0'.repeat(64)}),e=>e.kind==='integrity');assert.equal(fixture.calls.length,0);
  fixture.controls.corruptDownload=true;
  await assert.rejects(cloud.ensurePhoto(file),e=>e.kind==='integrity'&&e.assetId===file.id);assert.equal(fixture.visits.size,0);cloud.close();
});
test('lost visit response can be retried with the same identity and stale revisions are conflicts',async()=>{
  const {fixture,cloud}=setup(),pending=job();fixture.controls.loseSave=true;
  await assert.rejects(cloud.saveVisit(pending),e=>e.kind==='offline');
  assert.equal((await cloud.saveVisit(pending)).revision,1);assert.equal(fixture.visits.size,1);
  await assert.rejects(cloud.saveVisit({...pending,id:randomUUID()}),e=>e.kind==='conflict');cloud.close();
});
test('private photo deletion refuses references, then resumes after a lost delete response',async()=>{
  const {fixture,cloud}=setup(),file=await photo();await cloud.ensurePhoto(file);const pending=job([file.id]);await cloud.saveVisit(pending);
  assert.equal((await cloud.deletePhoto(file.id)).inUse,true);assert.equal(fixture.objects.size,1);
  await cloud.saveVisit({...pending,id:randomUUID(),expectedRevision:1,content:null});
  fixture.controls.loseDelete=true;await assert.rejects(cloud.deletePhoto(file.id),e=>e.kind==='offline');
  assert.equal((await cloud.deletePhoto(file.id)).deleted,true);assert.equal(fixture.objects.size,0);assert.equal(fixture.assets.get(file.id).state,'deleted');
  await assert.rejects(cloud.ensurePhoto(file),e=>e.kind==='retired');cloud.close();
});
test('pagination uses record IDs, includes tombstones, and never treats a missing row as deletion',async()=>{
  const {fixture,cloud}=setup();
  for(let i=0;i<405;i++)fixture.visits.set(`visit-${String(i).padStart(4,'0')}`,{user_id:owner,id:`visit-${String(i).padStart(4,'0')}`,revision:1,mutation_id:randomUUID(),payload:i%2?null:job().content.payload,photo_ids:[],deleted:Boolean(i%2)});
  const rows=await cloud.listVisits();assert.equal(rows.length,405);assert.ok(rows.some(r=>r.deleted));
  const calls=fixture.calls.filter(c=>c.url.pathname==='/rest/v1/journal_visits');assert.equal(calls.length,3);assert.equal(calls[1].url.searchParams.get('id'),'gt.visit-0199');cloud.close();
});
test('wrong/expired/missing sessions and secret keys fail before any private request',async()=>{
  const fixture=cloudFixture(owner);
  for(const session of [null,sessionFor(randomUUID()),sessionFor(owner,1)]){
    const cloud=createCloudJournal({...config,fetch:fixture.fetch,getSession:async()=>session});
    await assert.rejects(cloud.getVisit('a'),e=>e.kind==='session');cloud.close();
  }
  assert.equal(fixture.calls.length,0);
  assert.throws(()=>createCloudJournal({...config,publishableKey:'sb_secret_not_allowed',fetch:fixture.fetch}),/publishable/);
});
test('a token switch during a request cannot send A content with B credentials or return A data to B',async()=>{
  const fixture=cloudFixture(owner);let current=defaultSession;
  const cloud=createCloudJournal({...config,getSession:async()=>current,fetch:async(...args)=>{const result=await fixture.fetch(...args);current=sessionFor(randomUUID());return result;}});
  await assert.rejects(cloud.saveVisit(job()),e=>e.kind==='session');
  assert.equal(fixture.calls.length,1);assert.equal(fixture.calls[0].headers.get('authorization'),`Bearer ${defaultSession.access_token}`);assert.equal(fixture.calls[0].body.p_owner,owner);
  cloud.close();
});
test('timeouts cover an unavailable session or network; closing cancels delayed work without starting HTTP',async()=>{
  const cloud=createCloudJournal({...config,timeoutMs:25,fetch:()=>new Promise(()=>{})});
  await assert.rejects(cloud.getVisit('a'),e=>e.code==='timeout');cloud.close();
  const authTimeout=createCloudJournal({...config,timeoutMs:25,getSession:()=>new Promise(()=>{}),fetch:()=>{throw Error('Should not fetch');}});
  await assert.rejects(authTimeout.getVisit('a'),e=>e.code==='timeout');authTimeout.close();
  let release,calls=0;
  const closing=createCloudJournal({...config,getSession:()=>new Promise(r=>release=r),fetch:()=>{calls++;throw Error('Should not fetch');}});
  const pending=closing.getVisit('a');closing.close();await assert.rejects(pending,e=>e.kind==='session');release(sessionFor(owner));await new Promise(r=>setImmediate(r));assert.equal(calls,0);
});
test('single-row RPC arrays are supported while cross-account responses are rejected',async()=>{
  const {fixture,cloud}=setup();fixture.controls.arrayRpc=true;assert.equal((await cloud.saveVisit(job())).revision,1);
  fixture.visits.set('foreign',{...fixture.visits.values().next().value,id:'foreign',user_id:randomUUID()});
  await assert.rejects(cloud.getVisit('foreign'),e=>e.kind==='server');cloud.close();
});
test('a mismatched photo-removal response cannot delete another object',async()=>{
  const wrong=await photo();let deletes=0;
  const cloud=createCloudJournal({...config,fetch:async(url,options)=>{
    if(options.method==='DELETE')deletes++;
    return new Response(JSON.stringify({user_id:owner,id:wrong.id,object_name:`${owner}/${wrong.id}.png`,sha256:wrong.sha256,mime_type:wrong.mimeType,byte_size:wrong.byteSize,state:'deleting'}),{headers:{'content-type':'application/json'}});
  }});
  await assert.rejects(cloud.deletePhoto(randomUUID()),e=>e.kind==='server');assert.equal(deletes,0);cloud.close();
});
test('download deadlines still apply after headers arrive while the body is stalled',async()=>{
  const file=await photo();
  const cloud=createCloudJournal({...config,timeoutMs:25,fetch:async(_url,options)=>new Response(new ReadableStream({start(controller){options.signal.addEventListener('abort',()=>controller.error(options.signal.reason),{once:true});}}),{headers:{'content-type':'image/png'}})});
  await assert.rejects(cloud.downloadPhoto(file),e=>e.code==='timeout');cloud.close();
});
