import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {makeSave,attachPlace,saveToPlan,isExpired,expiringSoon,dedupeKey,findDuplicate,appFor,lastDay} from '../src/saves.js';
import {validateOuting,validateBackup,backupPayload,mergeOutings,checkCapacity,MAX_OUTINGS,MAX_SAVES,makeOuting} from '../src/model.js';
import {accountBackup,readAccountBackup} from '../src/accountBackup.js';
import {blankAccount,contentFromOuting,saveDesired,claimJob,acknowledgeJob,receiveRemote,validateAccount,canonicalAccountOuting} from '../src/syncQueue.js';
import {filterMemories,memoryOptions,groupMemories} from '../src/memoryFilters.js';
import {validateDraft} from '../src/drafts.js';

const now=new Date('2026-11-11T18:00:00.000Z');
const place={id:'osm/node/42',name:'Ramen pop-up',address:'Penn Ave',category:'restaurant',source:'OpenStreetMap',lat:40.45,lng:-79.98};
const reel='https://www.instagram.com/reel/C0ffee/?igsh=abc123&utm_source=ig_web_copy_link';
// Exactly what a pre-saves version of the app wrote (validateOuting is the canonical form).
const legacy=validateOuting({id:'legacy-1',place:{id:'osm/1',name:'Old haunt'},status:'visited',planDate:'',visitDate:'2026-01-01',notes:'',with:'Sam',rating:4,createdAt:'2026-01-01T18:00:00.000Z',updatedAt:'2026-01-01T18:00:00.000Z',photos:[]});

test('makeSave builds a valid unresolved save, infers the app and never invents a place',()=>{
  const s=makeSave({url:reel,text:'  ramen thing Sam sent ',expiresAt:'2026-11-16',now});
  assert.equal(s.status,'saved');assert.equal(s.place,null);
  assert.deepEqual(s.source,{url:reel,app:'instagram',text:'ramen thing Sam sent',savedAt:now.toISOString(),eventDate:'',expiresAt:'2026-11-16'});
  assert.equal(s.createdAt,now.toISOString());assert.deepEqual(validateOuting(s),s);
  assert.equal(makeSave({text:'that bar Sam mentioned',now}).source.app,'note');
  assert.equal(makeSave({url:'https://maps.app.goo.gl/xyz',now}).source.app,'google-maps');
  assert.equal(makeSave({url:'https://youtu.be/abc',app:'tiktok',now}).source.app,'tiktok');
  assert.throws(()=>makeSave({now}),/Nothing to save/);
  assert.throws(()=>makeSave({url:'javascript:alert(1)',now}),/saved link/);
  for(const [url,app] of [['https://vm.tiktok.com/x','tiktok'],['https://m.youtube.com/shorts/x','youtube'],['https://www.google.com/maps/place/x','google-maps'],['https://example.com','web'],['not a url','note']])assert.equal(appFor(url),app);
});

test('save -> attachPlace -> saveToPlan -> visited keeps one record and its source',()=>{
  const s=makeSave({url:reel,now});
  assert.throws(()=>saveToPlan(s,'2026-11-14'),/Choose the place/);
  const matched=attachPlace(s,place,new Date('2026-11-11T19:00:00Z'));
  assert.equal(matched.id,s.id);assert.equal(matched.place.name,'Ramen pop-up');assert.equal(matched.status,'saved');
  const plan=saveToPlan(matched,'2026-11-14',new Date('2026-11-11T20:00:00Z'));
  assert.equal(plan.status,'planned');assert.equal(plan.planDate,'2026-11-14');assert.deepEqual(plan.source,s.source);
  assert.throws(()=>saveToPlan(plan,''),/Only a save/);assert.throws(()=>attachPlace(plan,place),/Only a save/);
  assert.throws(()=>saveToPlan(matched,'2026-02-30'),/valid plan date/);
  const memory=validateOuting({...plan,status:'visited',visitDate:'2026-11-10',rating:5,updatedAt:'2026-11-11T21:00:00Z'});
  assert.equal(memory.status,'visited');assert.deepEqual(memory.source,s.source);
});

test('only saves may lack a place, and a placeless save must carry a source',()=>{
  const s=makeSave({url:reel,now});
  assert.throws(()=>validateOuting({...s,status:'planned'}),/Missing place/);
  assert.throws(()=>validateOuting({...s,source:undefined}),/needs a link/);
  assert.throws(()=>validateOuting({...s,visitDate:'2026-11-01'}),/date/);
  assert.throws(()=>validateOuting({...s,place:undefined}),/Missing place/);
  assert.throws(()=>validateOuting({...s,place,status:'someday'}),/status/);
});

test('malformed source objects are rejected',()=>{
  const s=makeSave({url:reel,now}),bad=source=>()=>validateOuting({...s,source});
  for(const source of ['https://x.com',[],{...s.source,app:'myspace'},{...s.source,app:undefined},{...s.source,url:'ftp://x.com/file'},{...s.source,url:7},
    {...s.source,url:'https://x.com/'+'a'.repeat(2100)},{...s.source,text:'x'.repeat(2001)},{...s.source,text:{}},{...s.source,savedAt:'yesterday'},{...s.source,savedAt:undefined},
    {...s.source,eventDate:'2026-02-30'},{...s.source,expiresAt:'16/11/2026'}])assert.throws(bad(source),/Invalid/);
  // Unknown keys are dropped, matching how places are canonicalized.
  assert.deepEqual(validateOuting({...s,source:{...s.source,extra:'x'}}).source,s.source);
});

test('old backups (no source field) import unchanged and keep their exact shape',()=>{
  const backup=JSON.parse(JSON.stringify(backupPayload({outings:[legacy]})));
  const [restored]=validateBackup(backup);
  assert.deepEqual(restored,legacy);assert.equal('source' in restored,false);
  assert.deepEqual(readAccountBackup(backup),[legacy]);
  // Its sync payload is byte-identical to before saves existed.
  assert.deepEqual(Object.keys(contentFromOuting(legacy,[]).content.payload),['place','status','planDate','visitDate','notes','with','rating','createdAt','updatedAt']);
  assert.deepEqual(validateOuting({...legacy,source:null}),legacy);
});

test('new backups round-trip saves, resolved saves and plans from saves',()=>{
  const pile=makeSave({url:reel,expiresAt:'2026-11-16',now}),note=makeSave({text:'rooftop bar',now}),plan=saveToPlan(attachPlace(makeSave({url:'https://example.com/show',now}),place),'2026-11-20');
  const outings=[legacy,pile,note,plan];
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(backupPayload({outings})))),outings);
  assert.deepEqual(readAccountBackup(JSON.parse(JSON.stringify(accountBackup({outings})))),outings);
  assert.deepEqual(mergeOutings([legacy],[pile,note]).outings,[legacy,pile,note]);
});

test('saves have their own capacity so a big pile never crowds out plans and memories',()=>{
  const memories=Array.from({length:MAX_OUTINGS},(_,i)=>({...legacy,id:`m${i}`}));
  const pile=Array.from({length:MAX_SAVES},(_,i)=>({...makeSave({text:`idea ${i}`,now}),id:`s${i}`}));
  assert.equal(checkCapacity([...memories,...pile]).length,MAX_OUTINGS+MAX_SAVES);
  assert.throws(()=>checkCapacity([...memories,{...legacy,id:'one-more'}]),/500 plans and memories/);
  assert.throws(()=>checkCapacity([...pile,{...pile[0],id:'one-more'}]),/1,000 saves/);
  assert.throws(()=>mergeOutings(memories,[{...legacy,id:'one-more'}]),/500 plans and memories/);
  assert.equal(validateBackup(backupPayload({outings:[...memories,...pile]})).length,1500);
  assert.throws(()=>validateBackup(backupPayload({outings:[...memories,...pile,{...legacy,id:'x'}]})),/up to 500 plans and memories plus 1,000 saves/);
});

test('null-place saves serialize through the sync queue and survive ack and remote receive',()=>{
  const owner=randomUUID(),s=makeSave({text:'that ramen place Sam mentioned',now});
  const entry=contentFromOuting(s,[]);
  assert.equal(entry.content.payload.place,null);assert.equal(entry.content.payload.status,'saved');
  const queued=saveDesired(blankAccount(owner),[entry]),{state,job}=claimJob(queued);
  assert.equal(job.content.payload.place,null);
  const wire=JSON.parse(JSON.stringify({user_id:owner,id:job.visitId,revision:1,mutation_id:job.id,payload:job.content.payload,photo_ids:[],deleted:false}));
  const acked=acknowledgeJob(state,job.id,wire);
  assert.equal(acked.records[0].job,null);assert.deepEqual(acked.records[0].base.content.payload,entry.content.payload);
  // Another device resolves the place; this device receives it as a normal update.
  const resolved=contentFromOuting(attachPlace(s,place,new Date('2026-11-12T00:00:00Z')),[]).content;
  const received=receiveRemote(acked,{...wire,revision:2,mutation_id:randomUUID(),payload:resolved.payload});
  assert.equal(received.records[0].desired.payload.place.name,'Ramen pop-up');
  assert.deepEqual(validateAccount(JSON.parse(JSON.stringify(received)),owner),received);
  assert.throws(()=>receiveRemote(acked,{...wire,revision:2,mutation_id:randomUUID(),payload:{...wire.payload,status:'planned'}}),/Missing place/);
  assert.deepEqual(canonicalAccountOuting(s),s);
});

test('sharing the same link twice is one save; tracking noise and URL variants are ignored',()=>{
  const a=makeSave({url:reel,now}),b=makeSave({url:'https://instagram.com/reels/C0ffee?utm_medium=share',now});
  assert.equal(dedupeKey(a),'url:instagram.com/reel/C0ffee');assert.equal(dedupeKey(a),dedupeKey(b));
  assert.equal(findDuplicate([legacy,a],b),a);assert.equal(findDuplicate([legacy,a],a),null);
  assert.equal(dedupeKey(makeSave({url:'https://youtu.be/abc123?si=x',now})),dedupeKey(makeSave({url:'https://www.youtube.com/watch?v=abc123&feature=share',now})));
  assert.equal(dedupeKey(makeSave({url:'https://m.youtube.com/shorts/abc123',now})),'url:youtube.com/watch?v=abc123');
  assert.notEqual(dedupeKey(makeSave({url:'https://example.com/e?id=1',now})),dedupeKey(makeSave({url:'https://example.com/e?id=2',now})));
  assert.equal(dedupeKey(makeSave({url:'https://example.com/e?b=2&a=1#top',now})),dedupeKey(makeSave({url:'https://example.com/e/?a=1&b=2',now})));
  assert.equal(dedupeKey(makeSave({text:'That  Ramen place',now})),dedupeKey(makeSave({text:'that ramen PLACE',now})));
  assert.equal(dedupeKey(makeSave({place,now})),'place:osm/node/42');
  assert.equal(findDuplicate([a],makeSave({url:'https://www.instagram.com/p/other/',now})),null);
  // A plan made from a save still catches a re-share of the same post.
  assert.equal(findDuplicate([saveToPlan(attachPlace(a,place))],b)?.id,a.id);
});

test('expiry uses the end date, falls back to the event date and only applies to saves',()=>{
  const popup=makeSave({url:'https://example.com/popup',expiresAt:'2026-11-16',now}),show=makeSave({url:'https://example.com/show',eventDate:'2026-11-22',now});
  const both=makeSave({url:'https://example.com/both',eventDate:'2026-11-12',expiresAt:'2026-11-30',now}),open=makeSave({text:'someday',now});
  assert.equal(lastDay(both),'2026-11-30');assert.equal(lastDay(open),'');
  assert.equal(isExpired(popup,'2026-11-16'),false);assert.equal(isExpired(popup,'2026-11-17'),true);
  assert.equal(isExpired(show,'2026-11-23'),true);assert.equal(isExpired(open,'2030-01-01'),false);
  assert.equal(isExpired(saveToPlan(attachPlace(popup,place)),'2026-12-01'),false);
  const pile=[open,show,both,popup];
  assert.deepEqual(expiringSoon(pile,'2026-11-11',7).map(s=>s.id),[popup.id]);
  assert.deepEqual(expiringSoon(pile,'2026-11-11',14).map(s=>s.id),[popup.id,show.id]);
  assert.deepEqual(expiringSoon(pile,'2026-11-17',30).map(s=>s.id),[show.id,both.id]);
  assert.deepEqual(expiringSoon(pile,'2026-12-31',30),[]);
});

test('saves are never listed as memories by the memory helpers',()=>{
  const save=attachPlace(makeSave({url:reel,text:'ramen',now}),place),unresolved=makeSave({text:'ramen',now});
  const all=[legacy,save,unresolved];
  assert.deepEqual(filterMemories(all,{query:'ramen'}),[]);
  assert.deepEqual(filterMemories(all).map(o=>o.id),[legacy.id]);
  assert.deepEqual(memoryOptions(all).places,[{id:'osm/1',name:'Old haunt'}]);
  assert.deepEqual(groupMemories(all).flatMap(g=>g.outings).map(o=>o.id),[legacy.id]);
});

test('an unfinished edit of an unresolved save restores with its place still empty',()=>{
  const s=makeSave({url:reel,now}),stamp=new Date().toISOString();
  const draft={version:1,id:'draft-save',isNew:false,originalStamp:s.updatedAt,savedAt:stamp,outing:{...s,notes:'go before Sunday'}};
  const restored=validateDraft(draft);
  assert.equal(restored.outing.place,null);assert.equal(restored.outing.notes,'go before Sunday');
  const blank=makeOuting({id:'manual',name:'x',source:'You'});
  assert.equal(validateDraft({...draft,outing:{...blank,place:{...blank.place,name:''}}}).outing.place.name,'');
});
