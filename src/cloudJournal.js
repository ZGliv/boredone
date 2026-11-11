import {createClient} from '@supabase/supabase-js';
import {accountId,UUID,validateAsset,remoteRecord,sameContent} from './syncQueue.js';
import {photoBytes,verifyPhotoData,verifiedPhotoData} from './syncPhotos.js';
const BUCKET='journal-photos-v1';
const VISIT_FIELDS='user_id,id,revision,mutation_id,payload,photo_ids,deleted,changed_at';
const ASSET_FIELDS='user_id,id,object_name,sha256,mime_type,byte_size,state';
export class CloudJournalError extends Error {
  constructor(kind,message,code='',assetId){super(message);this.name='CloudJournalError';this.kind=kind;this.code=code;this.assetId=assetId;}
}
function problem(error){
  if(error instanceof CloudJournalError)return error;
  const code=String(error?.code||error?.error||error?.statusCode||error?.status||'');
  const message=String(error?.message||'');
  if(code==='40001'||message.includes('journal_conflict'))return new CloudJournalError('conflict','This visit changed on another device.','journal_conflict');
  if(/journal_photo_retired|journal_photo_unavailable/.test(message))return new CloudJournalError('retired','This photo was retired on another device.','journal_photo_retired');
  if(/journal_photos_not_ready/.test(message))return new CloudJournalError('upload','Some photos are not ready in your account.','journal_photos_not_ready');
  if(/journal_photo_upload_incomplete/.test(message))return new CloudJournalError('upload','The photo upload has not finished.','journal_photo_upload_incomplete');
  if(/journal_photo_in_use/.test(message))return new CloudJournalError('in-use','Another visit still uses this photo.','journal_photo_in_use');
  if(/journal_photo_delete_incomplete/.test(message))return new CloudJournalError('upload','Photo removal has not finished.','journal_photo_delete_incomplete');
  if(/journal_account_changed/.test(message))return new CloudJournalError('session','The signed-in account changed. Pending saves are still on this device.','journal_account_changed');
  if(/journal_beta_access_required/.test(message))return new CloudJournalError('session','This account has not been enabled for the private beta.','journal_beta_access_required');
  if(/journal_photo_quota|journal_visit_limit|journal_photo_record_limit/.test(message)||code==='413'||code==='EntityTooLarge')return new CloudJournalError('quota','Your account has reached its storage limit. Pending saves remain on this device.',code);
  if(code==='401'||code==='PGRST301'||code==='PGRST303')return new CloudJournalError('session','Sign in again to resume your pending saves.',code);
  if(error instanceof TypeError||/Failed to fetch|fetch failed|NetworkError|network request failed/i.test(message))return new CloudJournalError('offline','Could not reach your account. Pending saves remain on this device.',code);
  return new CloudJournalError('server','The account service could not complete this request. Pending saves remain on this device.',code);
}
function one(result){
  if(result.error)throw problem(result.error);
  const data=Array.isArray(result.data)?(result.data.length===1?result.data[0]:null):result.data;
  if(!data||typeof data!=='object')throw new CloudJournalError('server','The account service returned an incomplete record.');
  return data;
}
function rows(result){
  if(result.error)throw problem(result.error);
  if(!Array.isArray(result.data))throw new CloudJournalError('server','The account service returned an invalid list.');
  return result.data;
}
function tokenFor(session,owner){
  // This is a client-side consistency check, not JWT signature verification.
  // Supabase validates the actual signature/permissions on every request.
  try{
    if(session?.user?.id!==owner||typeof session.access_token!=='string')throw Error();
    const parts=session.access_token.split('.');if(parts.length!==3)throw Error();
    const encoded=parts[1].replace(/-/g,'+').replace(/_/g,'/');
    const claims=JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length/4)*4,'=')));
    if(claims.sub!==owner||claims.role!=='authenticated'||!Number.isFinite(claims.exp)||claims.exp<=Date.now()/1000)throw Error();
    return session.access_token;
  }catch{throw new CloudJournalError('session','Sign in to this account again to resume its pending saves.','journal_account_changed');}
}
export function cloudAsset(value,owner){
  const safe=validateAsset({id:value?.id,sha256:value?.sha256,mimeType:value?.mime_type,byteSize:value?.byte_size});
  const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[safe.mimeType];
  if(value.user_id!==owner||value.object_name!==`${owner}/${safe.id}.${extension}`||!['reserved','ready','deleting','deleted'].includes(value.state))throw new CloudJournalError('server','The account service returned an invalid photo record.');
  return {...safe,objectName:value.object_name,state:value.state};
}
export function createCloudJournal({url,publishableKey,owner:ownerId,getSession,fetch:fetcher=globalThis.fetch,timeoutMs=20000}){
  const owner=accountId(ownerId);let closed=false;const operations=new Set();
  const base=new URL(url);
  if((base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(base.hostname)))||base.username||base.password||base.search||base.hash||base.pathname!=='/')throw Error('Use the account project URL.');
  if(typeof publishableKey!=='string'||!publishableKey.startsWith('sb_publishable_')||publishableKey.length<20)throw Error('Use a publishable account key, never a secret or service-role key.');
  if(typeof getSession!=='function'||typeof fetcher!=='function'||!Number.isFinite(timeoutMs)||timeoutMs<1)throw Error('Account transport is not configured.');
  function assertActive(){if(closed)throw new CloudJournalError('session','This account session has ended.','journal_account_changed');}
  async function request(action){
    assertActive();const controller=new AbortController();operations.add(controller);
    const timer=setTimeout(()=>controller.abort(new CloudJournalError('offline','The account request timed out. Pending saves remain on this device.','timeout')),timeoutMs);
    let rejectAbort;
    const aborted=new Promise((_,reject)=>{rejectAbort=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',rejectAbort,{once:true});});
    const check=()=>{assertActive();if(controller.signal.aborted)throw controller.signal.reason;};
    try{
      return await Promise.race([aborted,(async()=>{
        const token=tokenFor(await getSession(),owner);check();
        // A request gets a fixed token, not a global client's mutable login.
        // No auth persistence/refresh timers or anonymous fallback in this client.
        const client=createClient(base.origin,publishableKey,{accessToken:async()=>token,
          global:{fetch:(input,init={})=>{check();return fetcher(input,{...init,cache:'no-store',signal:controller.signal});}}});
        const result=await action(client);check();
        tokenFor(await getSession(),owner);check();
        return result;
      })()]);
    }catch(e){throw problem(e);}finally{clearTimeout(timer);operations.delete(controller);controller.signal.removeEventListener('abort',rejectAbort);}
  }
  const rpc=(name,args)=>request(async client=>one(await client.rpc(name,{...args,p_owner:owner})));
  async function getVisit(id){
    return request(async client=>{
      const result=await client.from('journal_visits').select(VISIT_FIELDS).eq('user_id',owner).eq('id',id).maybeSingle();
      if(result.error)throw problem(result.error);if(result.data===null)return null;
      const value=remoteRecord(result.data,owner);if(value.id!==id)throw new CloudJournalError('server','The account service returned the wrong visit.');
      return result.data;
    });
  }
  async function listVisits(){
    const records=new Map();let after;
    // Reset this cursor each pass. Absence from a page never means deletion.
    for(let page=0;page<6;page++){
      const batch=await request(async client=>{
        let query=client.from('journal_visits').select(VISIT_FIELDS).eq('user_id',owner).order('id',{ascending:true}).limit(200);
        if(after!==undefined)query=query.gt('id',after);
        return rows(await query);
      });
      for(const row of batch){remoteRecord(row,owner);const previous=records.get(row.id);if(!previous||row.revision>previous.revision)records.set(row.id,row);}
      if(records.size>1000)throw new CloudJournalError('server','The account journal exceeded its record limit.');
      if(batch.length<200)return [...records.values()];
      const cursor=batch.at(-1).id;if(cursor===after)throw new CloudJournalError('server','The account list did not advance.');after=cursor;
    }
    throw new CloudJournalError('server','The account journal could not be fully listed.');
  }
  async function getAssets(ids){
    const unique=[...new Set(ids)];if(unique.some(id=>!UUID.test(id))||unique.length>24)throw Error('Request up to 24 photo IDs.');
    if(!unique.length)return [];
    const result=await request(async client=>rows(await client.from('journal_assets').select(ASSET_FIELDS).eq('user_id',owner).in('id',unique)));
    const seen=new Set();
    return result.map(row=>{const asset=cloudAsset(row,owner);if(!unique.includes(asset.id)||seen.has(asset.id))throw new CloudJournalError('server','The account service returned unexpected photos.');seen.add(asset.id);return asset;});
  }
  async function downloadPhoto(asset){
    const safe=validateAsset(asset),extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[safe.mimeType];
    try{
      return await request(async client=>{
        const result=await client.storage.from(BUCKET).download(`${owner}/${safe.id}.${extension}`,{}, {cache:'no-store'});
        if(result.error)throw problem(result.error);
        if(!(result.data instanceof Blob)||result.data.size!==safe.byteSize)throw new CloudJournalError('integrity','The downloaded photo did not match its saved size.');
        try{return await verifiedPhotoData(new Uint8Array(await result.data.arrayBuffer()),safe);}catch{throw new CloudJournalError('integrity','The downloaded photo did not match its saved fingerprint.');}
      });
    }catch(e){e.assetId=safe.id;throw e;}
  }
  async function ensurePhoto(file){
    let safe;try{safe=await verifyPhotoData(file);}catch{throw new CloudJournalError('integrity','The local photo failed its integrity check. No upload was attempted.');}
    assertActive();
    try{
      let asset=cloudAsset(await rpc('prepare_journal_photo',{p_id:safe.id,p_sha256:safe.sha256,p_mime_type:safe.mimeType,p_byte_size:safe.byteSize}),owner);
      if(!sameContent(validateAsset(asset),validateAsset(safe)))throw new CloudJournalError('integrity','The account photo does not match the pending upload.');
      if(['deleting','deleted'].includes(asset.state))throw new CloudJournalError('retired','This photo was retired on another device.','journal_photo_retired',safe.id);
      if(asset.state!=='ready'){
        // Finalize first: an upload may have succeeded before its response was lost.
        try{asset=cloudAsset(await rpc('finish_journal_photo',{p_id:safe.id}),owner);}catch(e){
          if(e.code!=='journal_photo_upload_incomplete')throw e;
          const bytes=photoBytes(safe.dataUrl).bytes;
          const uploaded=await request(client=>client.storage.from(BUCKET).upload(asset.objectName,bytes.buffer,{contentType:safe.mimeType,cacheControl:'0',upsert:false}));
          if(uploaded.error){
            // A concurrent device/worker can finish the same immutable object.
            const code=String(uploaded.error.statusCode||uploaded.error.status||uploaded.error.code||'');
            const duplicate=/already exists|duplicate/i.test(String(uploaded.error.message||''))||code==='409';
            if(!duplicate)throw problem(uploaded.error);
          }
          asset=cloudAsset(await rpc('finish_journal_photo',{p_id:safe.id}),owner);
        }
      }
      if(asset.state!=='ready'||!sameContent(validateAsset(asset),validateAsset(safe)))throw new CloudJournalError('integrity','The completed photo did not match the pending upload.');
      return await downloadPhoto(asset);
    }catch(e){e.assetId=safe.id;throw e;}
  }
  async function saveVisit(job){
    if(job.owner!==owner||!UUID.test(job.id)||typeof job.visitId!=='string'||!Number.isInteger(job.expectedRevision)||job.expectedRevision<0)throw new CloudJournalError('session','This pending save belongs to a different account.','journal_account_changed');
    const response=await rpc('save_journal_visit',{p_id:job.visitId,p_expected_revision:job.expectedRevision,p_mutation_id:job.id,
      p_payload:job.content?.payload??null,p_photo_ids:job.content?.photoIds??[],p_deleted:job.content===null});
    const normalized=remoteRecord(response,owner);
    if(normalized.id!==job.visitId||normalized.mutationId!==job.id||normalized.revision!==job.expectedRevision+1||!sameContent(normalized.content,job.content))throw new CloudJournalError('server','The saved visit did not match the pending request.');
    return response;
  }
  async function deletePhoto(id){
    if(!UUID.test(id))throw Error('Invalid photo ID.');
    try{
      let asset=cloudAsset(await rpc('begin_journal_photo_delete',{p_id:id}),owner);
      if(asset.id!==id)throw new CloudJournalError('server','The account service returned the wrong photo for removal.');
      if(asset.state==='deleted')return {id,deleted:true};
      if(asset.state!=='deleting')throw new CloudJournalError('server','Photo removal was not authorized.');
      const result=await request(client=>client.storage.from(BUCKET).remove([asset.objectName]));
      if(result.error)throw problem(result.error);
      asset=cloudAsset(await rpc('finish_journal_photo_delete',{p_id:id}),owner);
      if(asset.id!==id||asset.state!=='deleted')throw new CloudJournalError('server','Photo removal has not finished.');
      return {id,deleted:true};
    }catch(e){
      if(e.kind==='in-use')return {id,deleted:false,inUse:true};
      if(e.kind==='retired'&&(await getAssets([id])).length===0)return {id,deleted:true,absent:true};
      e.assetId=id;throw e;
    }
  }
  function cancel(){for(const controller of operations)controller.abort(new CloudJournalError('session','The account request was canceled. Pending saves remain on this device.','canceled'));}
  function close(){closed=true;cancel();}
  return {owner,getVisit,listVisits,getAssets,ensurePhoto,downloadPhoto,saveVisit,deletePhoto,assertActive,cancel,close};
}
