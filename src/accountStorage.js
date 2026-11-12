// Separate from boredone-private-journal: creating a session never migrates guest
// saves or drafts. Call close() before replacing the authenticated UI/session.
import {validateOuting, VERSION} from './model.js';
import {validateDraft} from './drafts.js';
import {photoBytes,describePhoto,verifyPhotoData} from './syncPhotos.js';
import {accountId,blankAccount,validateAccount,validateAsset,canonicalAccountOuting,contentFromOuting,sameContent,
  saveDesired,claimJob,acknowledgeJob,failJob,receiveRemote,resolveConflict,remoteRecord,replaceRetiredJob} from './syncQueue.js';
const DB_NAME='boredone-account-journals', PHOTO_LIMIT=50*1024*1024;
const STORES=['accounts','photos','drafts','lifecycle'];
let connection;
function openDatabase(){
  if(connection)return connection;
  let failed=false;
  const attempt=new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB){failed=true;reject(Error('Account storage not supported here'));return;}
    const request=indexedDB.open(DB_NAME,2);
    const fail=()=>{failed=true;reject(Error('Account journal didn’t open'));};
    request.onupgradeneeded=()=>{for(const name of STORES)if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name);};
    request.onerror=fail;request.onblocked=fail;
    request.onsuccess=()=>{
      const db=request.result;if(failed){db.close();return;}
      const clear=()=>{if(connection===attempt)connection=undefined;};
      db.onversionchange=()=>{db.close();clear();};db.onclose=clear;resolve(db);
    };
  });
  connection=attempt;attempt.catch(()=>{if(connection===attempt)connection=undefined;});return attempt;
}
function references(state){
  return new Set(state.records.flatMap(r=>[r.desired,r.base?.content,r.job?.content,r.conflict?.content].flatMap(c=>c?.photoIds||[])));
}
function summary(state){
  const used=references(state);
  return {pending:state.records.filter(r=>r.job&&!r.conflict).length,ready:state.records.filter(r=>r.job&&!r.conflict&&!r.job.error).length,cleanup:(state.cleanup||[]).filter(id=>!used.has(id)).length,
    conflicts:state.records.filter(r=>r.conflict).map(r=>r.id),
    errors:state.records.filter(r=>r.job?.error&&!r.conflict).map(r=>({id:r.id,code:r.job.error}))};
}
function broadcast(owner,event='changed'){
  let channel;try{if(typeof BroadcastChannel!=='undefined'){channel=new BroadcastChannel(`boredone-account:${owner}`);channel.postMessage(event);}}catch{}finally{try{channel?.close();}catch{}}
}
function removalRecord(value,owner){
  if(value===undefined)return null;
  if(!value||value.version!==1||value.owner!==owner||accountId(value.requestId)!==value.requestId||!['requested','pending','removed'].includes(value.phase)||!Number.isFinite(Date.parse(value.updatedAt)))throw Error('Removal status didn’t load');
  return value;
}
function removalError(removed=false){
  const error=Error(removed?'This account’s device copy has been removed.':'Account removal is in progress. Export is available, but editing and sync are paused.');
  error.code=removed?'account_removed':'account_removing';return error;
}
// Lifecycle and cache writes share one IndexedDB transaction boundary. A late
// save/hash/download in another tab cannot recreate an erased account. The
// small removed marker intentionally remains after personal bytes are erased.
async function removalTransaction(ownerId,mode,action){
  const owner=accountId(ownerId),db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORES,mode),stores=Object.fromEntries(STORES.map(k=>[k,tx.objectStore(k)]));
    let result,error;
    const request=stores.lifecycle.get(owner);
    request.onsuccess=()=>{try{result=action(removalRecord(request.result,owner),stores,owner);}catch(e){error=e;tx.abort();}};
    tx.oncomplete=()=>{if(mode==='readwrite')broadcast(owner,'removal');resolve(result);};
    tx.onabort=()=>reject(error||Error('Removal status not saved'));
    tx.onerror=()=>{};
  });
}
export const readAccountRemoval=owner=>removalTransaction(owner,'readonly',state=>state);
export async function listAccountRemovals(){
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('lifecycle','readonly'),request=tx.objectStore('lifecycle').getAll();let rows,error;
    request.onsuccess=()=>{try{rows=request.result.map(row=>removalRecord(row,accountId(row.owner))).filter(row=>row.phase!=='removed');}catch(e){error=e;tx.abort();}};
    tx.oncomplete=()=>resolve(rows);tx.onabort=()=>reject(error||Error('Removal status didn’t load'));tx.onerror=()=>{};
  });
}
export function requestAccountRemoval(owner,requestId){
  const id=accountId(requestId);
  return removalTransaction(owner,'readwrite',(state,stores,owner)=>{
    if(state)return state;
    const next={version:1,owner,requestId:id,phase:'requested',updatedAt:new Date().toISOString()};stores.lifecycle.put(next,owner);return next;
  });
}
export function acceptAccountRemoval(owner,expectedRequestId,serverRequestId){
  const expected=accountId(expectedRequestId),server=accountId(serverRequestId);
  return removalTransaction(owner,'readwrite',(state,stores,owner)=>{
    if(!state||(state.requestId!==expected&&state.requestId!==server))throw Error('Changed in another tab');
    if(state.phase==='removed')return state;
    const next={...state,requestId:server,phase:'pending',updatedAt:new Date().toISOString()};stores.lifecycle.put(next,owner);return next;
  });
}
export function eraseAccountJournal(owner,requestId){
  const expected=accountId(requestId);
  return removalTransaction(owner,'readwrite',(state,stores,owner)=>{
    if(!state||state.requestId!==expected)throw Error('Type DELETE to remove');
    if(state.phase==='removed')return state;
    const range=IDBKeyRange.bound([owner,''],[owner,'\uffff']);
    stores.accounts.delete(owner);stores.photos.delete(range);stores.drafts.delete(range);
    const next={...state,phase:'removed',updatedAt:new Date().toISOString()};stores.lifecycle.put(next,owner);return next;
  });
}
export function createAccountJournal(ownerId){
  const owner=accountId(ownerId),transactions=new Set();let closed=false;
  function assertActive(){if(closed)throw Error('Signed out. Sign in again');}
  const scopeRange=()=>IDBKeyRange.bound([owner,''],[owner,'\uffff']);
  async function transaction(mode,action,notify=true){
    assertActive();const db=await openDatabase();assertActive();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORES,mode);transactions.add(tx);
      const stores=Object.fromEntries(STORES.map(k=>[k,tx.objectStore(k)]));
      let result,error;
      const abort=e=>{error=e;try{tx.abort();}catch{}};
      const lifecycle=stores.lifecycle.get(owner);
      lifecycle.onsuccess=()=>{try{
        assertActive();const removal=removalRecord(lifecycle.result,owner);
        if(removal?.phase==='removed'||removal&&mode==='readwrite')throw removalError(removal.phase==='removed');
        const request=stores.accounts.get(owner);
        request.onsuccess=()=>{try{assertActive();action(validateAccount(request.result||blankAccount(owner),owner),stores,value=>result=value,abort);}catch(e){abort(e);}};
      }catch(e){abort(e);}};
      tx.oncomplete=()=>{
        transactions.delete(tx);
        try{assertActive();if(mode==='readwrite'&&notify)broadcast(owner);resolve(result);}catch(e){reject(e);}
      };
      tx.onabort=()=>{transactions.delete(tx);reject(error||Error(closed?'This account session has ended.':tx.error?.name==='QuotaExceededError'
        ?'Your browser is out of space. The previous account journal and pending saves are intact.'
        :'The account journal could not be saved or read. Previous memories and pending saves are intact.'));};
      tx.onerror=()=>{};
    });
  }
  function putState(state,previous,stores){
    validateAccount(state,owner);
    // Retire local bytes only once no local/base/in-flight/conflict version needs
    // them. Cloud cleanup is a separate Storage API lifecycle, never this delete.
    const used=references(state);
    state.assets=state.assets.filter(a=>used.has(a.id));
    if(state.assets.reduce((n,a)=>n+a.byteSize,0)>PHOTO_LIMIT)throw Error('Photos full at 50 MB');
    for(const asset of previous.assets)if(!used.has(asset.id))stores.photos.delete([owner,asset.id]);
    stores.accounts.put(state,owner);
  }
  function loadFiles(ids,stores,done,abort){
    const files=new Map();if(!ids.length){done(files);return;}
    let remaining=ids.length;
    for(const id of ids){const request=stores.photos.get([owner,id]);request.onsuccess=()=>{
      try{const dataUrl=request.result;if(typeof dataUrl!=='string')throw Error('A photo is missing');photoBytes(dataUrl);files.set(id,dataUrl);if(--remaining===0)done(files);}catch(e){abort(e);}
    };}
  }
  const rawSnapshot=()=>transaction('readonly',(state,stores,done,abort)=>{
    loadFiles([...references(state)],stores,files=>done({state,files}),abort);
  });
  async function read(){
    return transaction('readonly',(state,stores,done,abort)=>{
      const ids=[...new Set(state.records.flatMap(r=>r.desired?.photoIds||[]))];
      let fileMap,drafts;
      const finish=()=>{if(!fileMap||!drafts)return;done({version:VERSION,revision:state.revision,
        outings:state.records.filter(r=>r.desired).map(r=>({id:r.id,...r.desired.payload,photos:r.desired.photoIds.map(id=>fileMap.get(id))})),drafts,sync:summary(state)});};
      loadFiles(ids,stores,files=>{fileMap=files;finish();},abort);
      const request=stores.drafts.getAll(scopeRange());request.onsuccess=()=>{try{drafts=request.result.map(r=>validateDraft(r,{preserveCalendarDate:true})).sort((a,b)=>b.savedAt.localeCompare(a.savedAt));finish();}catch(e){abort(e);}};
    });
  }
  async function save(outings,expectedRevision,{draftId,draftStamp,preserveCalendarDates=false}={}){
    assertActive();const input=structuredClone(outings),snapshot=await rawSnapshot();assertActive();
    const safe=input.map(o=>canonicalAccountOuting(o,preserveCalendarDates||snapshot.state.records.find(r=>r.id===o.id)?.desired?.payload.visitDate===o.visitDate));
    if(snapshot.state.revision!==expectedRevision)throw Error('Changed in another tab');
    const byData=new Map(snapshot.state.assets.map(a=>[snapshot.files.get(a.id),a])),byId=new Map(snapshot.state.assets.map(a=>[a.id,a])),newFiles=new Map(),entries=[];
    for(const outing of safe){
      const ids=[],prior=snapshot.state.records.find(r=>r.id===outing.id)?.desired;
      for(const [index,dataUrl] of outing.photos.entries()){
        const priorId=prior?.photoIds[index];
        let asset=priorId&&snapshot.files.get(priorId)===dataUrl?byId.get(priorId):byData.get(dataUrl);
        if(!asset){asset=await describePhoto(dataUrl,crypto.randomUUID());assertActive();byData.set(dataUrl,asset);byId.set(asset.id,asset);newFiles.set(asset.id,{...asset,dataUrl});}
        ids.push(asset.id);
      }
      entries.push(contentFromOuting(outing,ids,true));
    }
    return transaction('readwrite',(state,stores,done)=>{
      if(state.revision!==expectedRevision)throw Error('Changed in another tab');
      // Snapshot assets may have been pruned by an acknowledgement during hashing.
      const assets=[...new Set(entries.flatMap(e=>e.content.photoIds))].map(id=>byId.get(id));
      const next=saveDesired(state,entries,assets);
      const existingIds=new Set(state.assets.map(a=>a.id));
      for(const asset of assets){if(existingIds.has(asset.id))continue;const dataUrl=newFiles.get(asset.id)?.dataUrl??snapshot.files.get(asset.id);stores.photos.put(dataUrl,[owner,asset.id]);}
      putState(next,state,stores);
      if(draftId){const request=stores.drafts.get([owner,draftId]);request.onsuccess=()=>{if(request.result?.savedAt===draftStamp)stores.drafts.delete([owner,draftId]);};}
      done({version:VERSION,revision:next.revision,outings:safe,sync:summary(next)});
    });
  }
  async function importLegacy(outings,expectedRevision){
    assertActive();const incoming=outings.map(o=>canonicalAccountOuting(o,true)),seen=new Set();
    for(const outing of incoming){if(seen.has(outing.id))throw Error('The imported journal contains duplicate visit IDs.');seen.add(outing.id);}
    const current=await read();assertActive();
    if(current.revision!==expectedRevision)throw Error('Changed in another tab');
    const retired=new Set(await transaction('readonly',(state,_stores,done)=>done(state.records.filter(r=>!r.desired&&(r.base||r.job)).map(r=>r.id))));
    const merged=[...current.outings],existing=new Map(merged.map(o=>[o.id,o]));
    let added=0,copies=0,alreadyHere=0;
    for(const outing of incoming){
      const prior=existing.get(outing.id);
      if((prior||retired.has(outing.id))&&(sameContent(prior,outing)||merged.some(o=>o.id!==outing.id&&sameContent({...o,id:outing.id},outing)))){alreadyHere++;continue;}
      const needsCopy=prior||retired.has(outing.id);
      const copy=needsCopy?{...outing,id:crypto.randomUUID()}:outing;
      if(needsCopy)copies++;
      merged.push(copy);existing.set(copy.id,copy);added++;
    }
    const saved=added?await save(merged,expectedRevision,{preserveCalendarDates:true}):current;
    return {...saved,imported:{added,copies,alreadyHere}};
  }
  async function nextJob(excluded=[]){
    return transaction('readwrite',(state,stores,done,abort)=>{
      const claimed=claimJob(state,excluded);
      if(!claimed.job){done(null);return;}
      stores.accounts.put(claimed.state,owner);
      const ids=[...new Set(claimed.job.content?.photoIds||[])];
      loadFiles(ids,stores,files=>done({...claimed.job,photos:ids.map(id=>({...state.assets.find(a=>a.id===id),dataUrl:files.get(id)}))}),abort);
    },false);
  }
  const acknowledge=(jobId,response)=>transaction('readwrite',(state,stores,done)=>{const next=acknowledgeJob(state,jobId,response);putState(next,state,stores);done(summary(next));},false);
  const markError=(jobId,code)=>transaction('readwrite',(state,stores,done)=>{const next=failJob(state,jobId,code);stores.accounts.put(next,owner);done(summary(next));},false);
  async function receive(response,photos=[]){
    assertActive();const remote=remoteRecord(response,owner),verified=[],seen=new Set();
    for(const file of photos){
      const expected=validateAsset(file);
      if(seen.has(expected.id)||!remote.content?.photoIds.includes(expected.id))throw Error('Unexpected downloaded photo.');
      seen.add(expected.id);
      const actual=await describePhoto(file.dataUrl,expected.id);assertActive();
      if(!sameContent(actual,expected))throw Error('A photo didn’t download');
      verified.push({...expected,dataUrl:file.dataUrl,verified:true});
    }
    return transaction('readwrite',(state,stores,done,abort)=>{
      const next=receiveRemote(state,response,verified);
      const used=references(next);
      for(const file of verified)if(used.has(file.id))stores.photos.put(file.dataUrl,[owner,file.id]);
      // Even a conflict must have complete verified photo bytes before it can be
      // offered as a replacement. A failed download never erases the local visit.
      loadFiles([...new Set(remote.content?.photoIds||[])].filter(id=>used.has(id)),stores,()=>{try{putState(next,state,stores);done(summary(next));}catch(e){abort(e);}},abort);
    });
  }
  const syncIndex=()=>transaction('readonly',(state,_stores,done)=>{const used=references(state);done({
    records:state.records.map(r=>({id:r.id,revision:r.base?.revision||0,conflictRevision:r.conflict?.revision||0,jobId:r.job?.id||null})),
    cleanupIds:(state.cleanup||[]).filter(id=>!used.has(id)),...summary(state)
  });});
  const isCurrentJob=id=>transaction('readonly',(state,_stores,done)=>done(state.records.some(r=>r.job?.id===id&&!r.conflict)));
  async function cachedPhoto(id){
    const file=await transaction('readonly',(state,stores,done)=>{
      const asset=state.assets.find(a=>a.id===id);if(!asset){done(null);return;}
      const request=stores.photos.get([owner,id]);request.onsuccess=()=>done(typeof request.result==='string'?{...asset,dataUrl:request.result}:null);
    });
    if(!file)return null;
    try{await verifyPhotoData(file);}catch{assertActive();return null;}
    assertActive();return file;
  }
  async function cacheVerifiedPhoto(file){
    const safe=await verifyPhotoData(file);assertActive();
    return transaction('readwrite',(state,stores,done,abort)=>{
      const asset=state.assets.find(a=>a.id===safe.id);if(!asset){done(false);return;}
      if(!sameContent(validateAsset(asset),validateAsset(safe)))throw Error('Photo identity changed.');
      const request=stores.photos.get([owner,safe.id]);request.onsuccess=()=>{try{
        if(request.result!==safe.dataUrl)stores.photos.put(safe.dataUrl,[owner,safe.id]);
        asset.verified=true;stores.accounts.put(state,owner);done(true);
      }catch(e){abort(e);}};
    },false);
  }
  const replaceRetiredPhotos=(jobId,proof)=>transaction('readwrite',(state,stores,done,abort)=>{
    const result=replaceRetiredJob(state,jobId,proof);
    if(!result.replacements.length){done(false);return;}
    loadFiles(result.replacements.map(r=>r.from),stores,files=>{try{
      for(const {from,to} of result.replacements)stores.photos.put(files.get(from),[owner,to]);
      putState(result.state,state,stores);done(true);
    }catch(e){abort(e);}},abort);
  });
  const finishCleanup=id=>transaction('readwrite',(state,stores,done)=>{
    state.cleanup=(state.cleanup||[]).filter(candidate=>candidate!==id);stores.accounts.put(state,owner);done();
  },false);
  const resolve=(id,choice,expectedRevision)=>transaction('readwrite',(state,stores,done)=>{
    if(state.revision!==expectedRevision)throw Error('Changed in another tab');
    const next=resolveConflict(state,id,choice);putState(next,state,stores);done(summary(next));
  });
  const writeDraft=record=>{
    const safe=validateDraft(record,{preserveCalendarDate:true});
    return transaction('readwrite',(_state,stores,done,abort)=>{
      const request=stores.drafts.getAll(scopeRange());request.onsuccess=()=>{try{
        const existing=request.result.find(r=>r.id===safe.id);
        if(existing&&existing.savedAt!==record.previousSavedAt)throw Error('Changed in another tab');
        const others=request.result.filter(r=>r.id!==safe.id);
        if(others.length>=10||new Blob([JSON.stringify([...others,safe])]).size>PHOTO_LIMIT)throw Error('10 drafts max');
        stores.drafts.put(safe,[owner,safe.id]);done(safe);
      }catch(e){abort(e);}};
    });
  };
  const deleteDraft=(id,stamp)=>transaction('readwrite',(_state,stores,done,abort)=>{
    const request=stores.drafts.get([owner,id]);request.onsuccess=()=>{
      if(request.result&&request.result.savedAt!==stamp){abort(Error('Changed in another tab'));return;}
      stores.drafts.delete([owner,id]);done();
    };
  });
  const readDrafts=()=>transaction('readonly',(_state,stores,done,abort)=>{
    const request=stores.drafts.getAll(scopeRange());request.onsuccess=()=>{try{done(request.result.map(r=>validateDraft(r,{preserveCalendarDate:true})).sort((a,b)=>b.savedAt.localeCompare(a.savedAt)));}catch(e){abort(e);}};
  });
  const conflicts=()=>transaction('readonly',(state,stores,done,abort)=>{
    const records=state.records.filter(r=>r.conflict);
    loadFiles([...new Set(records.flatMap(r=>r.conflict.content?.photoIds||[]))],stores,files=>done({revision:state.revision,items:records.map(r=>({id:r.id,local:r.desired?{id:r.id,...r.desired.payload}:null,cloud:r.conflict.content?{id:r.id,...r.conflict.content.payload,photos:r.conflict.content.photoIds.map(id=>files.get(id))}:null}))}),abort);
  });
  function close(){closed=true;for(const tx of transactions){try{tx.abort();}catch{}}transactions.clear();}
  return {owner,read,readDrafts,conflicts,save,importLegacy,nextJob,acknowledge,markError,receive,syncIndex,isCurrentJob,cachedPhoto,cacheVerifiedPhoto,replaceRetiredPhotos,finishCleanup,resolveConflict:resolve,writeDraft,deleteDraft,assertActive,close};
}
