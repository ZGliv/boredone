import {accountId} from './syncQueue.js';
import * as local from './accountStorage.js';
const messages={not_configured:'Account removal is temporarily unavailable. Your device copy is still here.',sign_in_required:'Sign in to the same Google account to continue removal.',account_changed:'The signed-in account changed. No other account will be removed.',receipt_not_found:'Removal could not be confirmed. Keep your device copy and try signing in to the same account.',storage_review_required:'Photo removal needs support before it can finish. Your device copy is still here.'};
function failure(code='retry_removal'){const error=Error(messages[code]||'Removal paused. Reconnect and try again. Your device copy is still here.');error.code=code;return error;}
export function createAccountRemoval({getSession,fetch:fetcher=globalThis.fetch,storage=local,onChange=()=>{},timeoutMs=30000}){
  let closed=false;const requests=new Set(),runs=new Map();
  const active=()=>{if(closed)throw failure('closed');};
  async function bounded(action){
    active();const controller=new AbortController();requests.add(controller);let timer;
    const stopped=new Promise((_,reject)=>{controller.signal.addEventListener('abort',()=>reject(failure()),{once:true});timer=setTimeout(()=>controller.abort(),timeoutMs);});
    try{return await Promise.race([action(controller.signal),stopped]);}finally{clearTimeout(timer);requests.delete(controller);}
  }
  async function access(owner){
    let session;try{session=await getSession(owner);}catch{throw failure();}active();
    if(!session?.access_token||session.user?.id!==owner)throw failure('sign_in_required');return session.access_token;
  }
  async function post(record,action){
    return bounded(async signal=>{
      const headers={'Content-Type':'application/json'};
      if(action!=='status')headers.Authorization=`Bearer ${await access(record.owner)}`;
      active();if(signal.aborted)throw failure();
      let response,value;
      try{response=await fetcher('/api/account-removal',{method:'POST',headers,credentials:'omit',cache:'no-store',signal,body:JSON.stringify({owner:record.owner,requestId:record.requestId,action,confirmation:'DELETE'})});value=await response.json();}catch{throw failure();}
      active();if(signal.aborted)throw failure();
      if(!response.ok)throw failure(value?.error);
      if(!value||!['pending','complete'].includes(value.status)||typeof value.requestId!=='string')throw failure();
      const id=accountId(value.requestId);if(action!=='start'&&id!==record.requestId)throw failure();
      return {...value,requestId:id};
    });
  }
  async function finish(record){
    active();const result=await storage.eraseAccountJournal(record.owner,record.requestId);active();onChange(result);return result;
  }
  async function accept(record,response){
    active();const next=await storage.acceptAccountRemoval(record.owner,record.requestId,response.requestId);active();onChange(next);
    return response.status==='complete'?finish(next):next;
  }
  async function drain(record){
    for(let pass=0;pass<3&&record.phase!=='removed';pass++){
      const response=await post(record,'continue');record=await accept(record,response);
    }
    return record;
  }
  function exclusive(owner,action){
    active();const id=accountId(owner);if(runs.has(id))return runs.get(id);
    const run=action(id).finally(()=>runs.delete(id));runs.set(id,run);return run;
  }
  function start(owner,confirmation){
    if(confirmation!=='DELETE')return Promise.reject(failure('confirmation_required'));
    return exclusive(owner,async id=>{
      if(globalThis.navigator?.onLine===false)throw failure();
      await bounded(async signal=>{await access(id);if(signal.aborted)throw failure();});active();
      const record=await storage.requestAccountRemoval(id,crypto.randomUUID());active();onChange(record);
      if(record.phase==='removed')return record;
      const response=await post(record,'start'),accepted=await accept(record,response);
      return accepted.phase==='removed'?accepted:drain(accepted);
    });
  }
  function resume(owner){return exclusive(owner,async id=>{
    if(globalThis.navigator?.onLine===false)throw failure();
    let record=await storage.readAccountRemoval(id);active();if(!record)throw failure('receipt_not_found');if(record.phase==='removed')return record;
    let response;try{response=await post(record,'status');}catch(e){if(e.code!=='receipt_not_found'||record.phase!=='requested')throw e;response=await post(record,'start');}
    record=await accept(record,response);return record.phase==='removed'?record:drain(record);
  });}
  async function check(){
    const records=await storage.listAccountRemovals();active();let completed=0,unconfirmed=0;
    for(const record of records){try{const response=await post(record,'status');if(response.status==='complete'){await finish(record);completed++;}}catch(e){if(closed)throw e;unconfirmed++;}}
    return {completed,unconfirmed,remaining:(await storage.listAccountRemovals()).length};
  }
  function close(){closed=true;for(const request of requests)request.abort();requests.clear();}
  return {start,resume,check,close};
}
