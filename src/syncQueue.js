// Account-only sync state. Guest journals never enter this queue automatically.
import {validateOuting, validDate, localDate, MAX_PHOTOS, MAX_RECORDS, checkCapacity} from './model.js';
// Tombstones are permanent and Pile triage deletes often, so retained records
// (live + deleted) get headroom well beyond the live limits. Matches the SQL cap.
export const MAX_RETAINED = 5000;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ACCOUNT_VERSION = 1;
const clone = value => structuredClone(value);
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  return value;
}
export const sameContent = (a,b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
export function accountId(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw Error('A verified account ID is required.');
  return value.toLowerCase();
}
export function blankAccount(owner) {
  return {version:ACCOUNT_VERSION,owner:accountId(owner),revision:0,records:[],assets:[],cleanup:[]};
}
export function canonicalAccountOuting(outing,preserveCalendarDate=false) {
  // Stored dates belong to the person who captured the visit, not the clock of
  // the device reading it. New/changed local dates still use normal validation.
  const date=outing?.visitDate;
  if(preserveCalendarDate&&validDate(date||'')&&date>localDate()){
    return {...validateOuting({...outing,visitDate:localDate()}),visitDate:date};
  }
  return validateOuting(outing);
}
export function contentFromOuting(outing, photoIds, preserveCalendarDate=false) {
  const {id,photos,...payload} = canonicalAccountOuting(outing,preserveCalendarDate);
  if(photos.length!==photoIds.length)throw Error('Photo references do not match this visit.');
  return {id, content:validateContent({payload,photoIds},id)};
}
export function validateContent(value,id) {
  if (value === null) return null;
  if (!value || !Array.isArray(value.photoIds) || value.photoIds.length > MAX_PHOTOS || value.photoIds.some(p=>!UUID.test(p))) throw Error('Invalid account photo references.');
  const {id:unusedId,photos:unusedPhotos,...payload}=canonicalAccountOuting({...value.payload,id,photos:[]},true);
  return {payload,photoIds:[...value.photoIds]};
}
export function validateAsset(value) {
  if (!value || typeof value.id!=='string' || !UUID.test(value.id) || typeof value.sha256!=='string' || !/^[a-f0-9]{64}$/.test(value.sha256) || !['image/jpeg','image/png','image/webp'].includes(value.mimeType)
    || !Number.isInteger(value.byteSize) || value.byteSize<1 || value.byteSize>1050000) throw Error('Invalid account photo.');
  return {id:value.id.toLowerCase(),sha256:value.sha256,mimeType:value.mimeType,byteSize:value.byteSize};
}
export function remoteRecord(value,owner) {
  if (!value || value.user_id!==accountId(owner) || typeof value.id!=='string' || !value.id.trim() || value.id.length>100
    || !Number.isInteger(value.revision) || value.revision<1 || value.revision>2147483647 || !UUID.test(value.mutation_id) || typeof value.deleted!=='boolean') throw Error('Invalid account response.');
  if (value.deleted && (value.payload!==null || !Array.isArray(value.photo_ids) || value.photo_ids.length)) throw Error('Invalid deleted visit.');
  return {id:value.id,revision:value.revision,mutationId:value.mutation_id,
    content:value.deleted?null:validateContent({payload:value.payload,photoIds:value.photo_ids},value.id)};
}
export function validateAccount(value,owner) {
  if (!value || value.version!==ACCOUNT_VERSION || value.owner!==accountId(owner) || !Number.isSafeInteger(value.revision) || value.revision<0
    || !Array.isArray(value.records) || value.records.length>MAX_RETAINED || !Array.isArray(value.assets) || value.assets.length>24000) throw Error('This account journal could not be read. It has not been changed.');
  if(value.cleanup!==undefined&&(!Array.isArray(value.cleanup)||value.cleanup.length>24000||value.cleanup.some(id=>!UUID.test(id))||new Set(value.cleanup).size!==value.cleanup.length))throw Error('Invalid pending photo cleanup.');
  const assetIds=new Set(), ids=new Set(),jobIds=new Set();
  value.assets.forEach(a=>{validateAsset(a);if(a.verified!==undefined&&typeof a.verified!=='boolean')throw Error('Invalid photo verification receipt.');if(assetIds.has(a.id))throw Error('Duplicate account photo.');assetIds.add(a.id);});
  value.records.forEach(r=>{
    if (!r || typeof r.id!=='string' || !r.id.trim() || r.id.length>100 || ids.has(r.id)) throw Error('Invalid account visit.');
    if(!['desired','base','job','conflict'].every(key=>Object.hasOwn(r,key)&&r[key]!==undefined))throw Error('Incomplete account visit.');
    for(const part of [r.base,r.job,r.conflict])if(part!==null&&(typeof part!=='object'||!Object.hasOwn(part,'content')||part.content===undefined))throw Error('Incomplete pending save.');
    ids.add(r.id);
    for (const c of [r.desired,r.base?.content,r.job?.content,r.conflict?.content]) if(c!==undefined){validateContent(c,r.id);if(c?.photoIds.some(id=>!assetIds.has(id)))throw Error('Account photo metadata is missing.');}
    if (r.base && (!Number.isInteger(r.base.revision)||r.base.revision<1||r.base.revision>2147483647)) throw Error('Invalid account revision.');
    if (r.job && (!UUID.test(r.job.id)||!Number.isInteger(r.job.expectedRevision)||r.job.expectedRevision<0||r.job.expectedRevision!==(r.base?.revision||0)||typeof r.job.attempted!=='boolean')) throw Error('Invalid pending save.');
    if(r.job){if(jobIds.has(r.job.id))throw Error('Duplicate pending save.');jobIds.add(r.job.id);}
    if (r.conflict && (r.conflict.id!==r.id||!UUID.test(r.conflict.mutationId)||!Number.isInteger(r.conflict.revision)||r.conflict.revision<1||r.conflict.revision>2147483647)) throw Error('Invalid conflicting save.');
  });
  checkCapacity(value.records.filter(r=>r.desired).map(r=>r.desired.payload));
  return value;
}
function mergeAssets(state,assets){
  const byId=new Map(state.assets.map(a=>[a.id,a]));
  for(const asset of assets){
    const safe=validateAsset(asset),prior=byId.get(safe.id);
    if(prior&&!sameContent(validateAsset(prior),safe))throw Error('Photo identity changed.');
    if(prior){if(asset.verified===true)prior.verified=true;}
    else {const added={...safe,verified:asset.verified===true};state.assets.push(added);byId.set(safe.id,added);}
  }
}
function enqueueCleanup(state,ids){state.cleanup=[...new Set([...(state.cleanup||[]),...ids])];}
function removedPhotos(before,after){return (before?.photoIds||[]).filter(id=>!after?.photoIds.includes(id));}
function queueDesired(record,newId) {
  if(record.conflict || record.job?.attempted)return;
  record.job=sameContent(record.desired,record.base?.content??null)?null:{id:newId(),expectedRevision:record.base?.revision||0,content:clone(record.desired),attempted:false,error:null};
}
export function saveDesired(state,entries,assets=[],newId=()=>crypto.randomUUID()) {
  const next=clone(state), incoming=new Map();
  if(entries.length>MAX_RECORDS)throw Error('Your account journal supports 500 plans and memories plus 1,000 saves.');
  for(const entry of entries){if(incoming.has(entry.id))throw Error('Duplicate account visit.');incoming.set(entry.id,validateContent(entry.content,entry.id));}
  mergeAssets(next,assets);
  for(const record of next.records){
    const desired=incoming.get(record.id)??null;incoming.delete(record.id);
    if(desired && ((record.base&&record.base.content===null)||(record.job?.attempted&&record.job.content===null)))throw Error('This visit was deleted or is being deleted. Save it as a separate visit.');
    if(!sameContent(desired,record.desired)){record.desired=desired;queueDesired(record,newId);}
  }
  for(const [id,desired] of incoming){const r={id,desired,base:null,job:null,conflict:null};queueDesired(r,newId);next.records.push(r);}
  next.records=next.records.filter(r=>r.desired||r.base||r.job||r.conflict);
  next.revision++;
  return validateAccount(next,state.owner);
}
export function claimJob(state,excluded=[]) {
  const skip=new Set(excluded);
  const next=clone(state),eligible=next.records.filter(r=>r.job&&!r.conflict&&!skip.has(r.job.id));
  const record=eligible.find(r=>!r.job.error)||eligible[0];
  if(!record)return {state:next,job:null};
  record.job.attempted=true;
  return {state:next,job:{owner:state.owner,visitId:record.id,...clone(record.job)}};
}
export function acknowledgeJob(state,jobId,response,newId=()=>crypto.randomUUID()) {
  const remote=remoteRecord(response,state.owner),next=clone(state),r=next.records.find(r=>r.job?.id===jobId);
  if(!r)return next; // A second worker/retried acknowledgement already retired it.
  if(remote.id!==r.id||remote.mutationId!==jobId||remote.revision!==r.job.expectedRevision+1||!sameContent(remote.content,r.job.content)) throw Error('The server acknowledgement did not match the pending save.');
  if(r.conflict && r.conflict.revision>remote.revision)return next;
  enqueueCleanup(next,removedPhotos(r.base?.content,remote.content));
  r.base={revision:remote.revision,content:clone(remote.content)};r.job=null;r.conflict=null;
  queueDesired(r,newId);
  return validateAccount(next,state.owner);
}
export function failJob(state,jobId,code) {
  if(!['offline','session','quota','upload','server'].includes(code))throw Error('Invalid sync failure.');
  const next=clone(state),r=next.records.find(r=>r.job?.id===jobId);
  if(r)r.job.error=code;
  return next;
}
export function receiveRemote(state,response,assets=[],newId=()=>crypto.randomUUID()) {
  const remote=remoteRecord(response,state.owner),next=clone(state);
  mergeAssets(next,assets);
  const r=next.records.find(r=>r.id===remote.id);
  if(r?.job?.id===remote.mutationId)return acknowledgeJob(next,r.job.id,response,newId);
  if(r && remote.revision<=(r.base?.revision||0))return next;
  if(r?.conflict && remote.revision<=r.conflict.revision)return next;
  if(r?.job||r?.conflict){r.conflict=remote;next.revision++;return validateAccount(next,state.owner);}
  if(r){enqueueCleanup(next,removedPhotos(r.base?.content,remote.content));r.base={revision:remote.revision,content:clone(remote.content)};r.desired=clone(remote.content);}
  else next.records.push({id:remote.id,desired:clone(remote.content),base:{revision:remote.revision,content:clone(remote.content)},job:null,conflict:null});
  next.revision++;
  return validateAccount(next,state.owner);
}
export function resolveConflict(state,id,choice,newId=()=>crypto.randomUUID()) {
  if(!['keep-both','use-cloud'].includes(choice))throw Error('Choose how to resolve this conflict.');
  const next=clone(state),r=next.records.find(r=>r.id===id);
  if(!r?.conflict)throw Error('This conflict changed. Reload the journal.');
  if(choice==='keep-both'){
    if(!r.desired)throw Error('There is no local visit to keep as a copy.');
    const copy={id:newId(),desired:clone(r.desired),base:null,job:null,conflict:null};queueDesired(copy,newId);next.records.push(copy);
  }
  enqueueCleanup(next,[...removedPhotos(r.base?.content,r.conflict.content),...removedPhotos(r.job?.content,r.conflict.content)]);
  r.base={revision:r.conflict.revision,content:clone(r.conflict.content)};r.desired=clone(r.conflict.content);r.job=null;r.conflict=null;
  next.revision++;
  return validateAccount(next,state.owner);
}

// Call only with actual server retirement evidence and a freshly read visit
// revision. An ordinary timeout is never permission to change a mutation ID.
export function replaceRetiredJob(state,jobId,proof,newId=()=>crypto.randomUUID()){
  const next=clone(state),r=next.records.find(r=>r.job?.id===jobId);
  if(!r||r.conflict)return {state:next,replacements:[]};
  if(proof?.visitRevision!==r.job.expectedRevision||!Array.isArray(proof.assets)||!proof.assets.length||!r.job.content
    ||proof.assets.some(a=>!['deleting','deleted'].includes(a.state)||!r.job.content.photoIds.includes(a.id)))throw Error('Photo retirement has not been confirmed for this pending save.');
  const replacements=[...new Set(proof.assets.map(a=>a.id))].map(from=>({from,to:newId()}));
  for(const {from,to} of replacements){const prior=next.assets.find(a=>a.id===from);if(!prior)throw Error('The pending photo is missing.');next.assets.push({...validateAsset(prior),id:to,verified:false});}
  const remap=content=>content?{...content,photoIds:content.photoIds.map(id=>replacements.find(r=>r.from===id)?.to||id)}:null;
  r.desired=remap(r.desired);
  r.job={...r.job,id:newId(),content:remap(r.job.content),attempted:false,error:null};
  enqueueCleanup(next,replacements.map(r=>r.from));
  next.revision++; // Reject an editor still preparing references to the retired IDs.
  return {state:validateAccount(next,state.owner),replacements};
}
