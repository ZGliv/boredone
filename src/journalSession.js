import {createClient} from '@supabase/supabase-js';
import {createAccountJournal,readAccountRemoval,listAccountRemovals} from './accountStorage.js';
import {createAccountRemoval} from './accountRemoval.js';
import {createCloudJournal} from './cloudJournal.js';
import {createJournalSync} from './syncRunner.js';
import {accountId,canonicalAccountOuting} from './syncQueue.js';
import {accountBackup,readAccountBackup,ACCOUNT_BACKUP_BYTES} from './accountBackup.js';
import {createLocalAccountHint} from './localAccountHint.js';

// Auth owns the lifecycle, never the queue. Each scope captures one owner and is
// revoked before a different journal is presented. No automatic guest migration.
export function createJournalSession({url,publishableKey,onChange,auth:providedAuth,fetch:fetcher=globalThis.fetch,localHint:providedHint}){
  const base=new URL(url);
  if((base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)))||base.pathname!=='/'||base.search||base.hash||base.username||base.password)throw Error('Invalid account project URL.');
  if(!publishableKey?.startsWith('sb_publishable_')||publishableKey.length<20)throw Error('Use a publishable account key.');
  const hint=providedHint||createLocalAccountHint(url);
  const auth=providedAuth||createClient(base.origin,publishableKey,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:hint.authKey},global:{fetch:fetcher}}).auth;
  let closed=false,current=null,scope=null,subscription,timer,startTimer,retries=0,signingOut=false,authGeneration=0;
  let state={key:'guest',owner:null,store:null,user:null,phase:'loading',error:'',lastSyncedAt:null,localOnly:false,removal:null,unfinishedRemovals:0,removalNotice:''};
  const emit=patch=>{if(!closed){state={...state,...patch};onChange({...state});}};
  const alive=s=>!closed&&scope===s;
  const removalClient=createAccountRemoval({fetch:fetcher,getSession:async owner=>{
    const {data,error}=await auth.getSession();if(error)throw error;
    return data.session?.user.id===owner?data.session:null;
  },onChange:record=>{
    if(scope?.owner===record.owner)haltScope(scope);
    void refreshRemoval(record.owner).catch(()=>{});
  }});
  function haltScope(s){s.halted=true;clearTimeout(timer);s.worker.stop();s.cloud.close();}
  async function refreshPending(){
    try{const rows=await listAccountRemovals();emit({unfinishedRemovals:rows.length});}catch{/* The journal's storage error remains visible. */}
  }
  async function refreshRemoval(owner){
    const marker=await readAccountRemoval(owner),s=scope;
    if(marker&&s?.owner===owner&&alive(s)){
      haltScope(s);
      if(marker.phase==='removed'){
        if(hint.read()?.owner===owner)hint.forget();
        current=null;authGeneration++;clearScope();
        emit({key:'guest',owner:null,store:null,user:null,phase:'local',error:'',lastSyncedAt:null,localOnly:false,removal:null,removalNotice:'Account removed. Your guest saves are still on this device.'});
      }else emit({key:`account:${owner}:removal`,removal:marker,phase:'account-removing',lastSyncedAt:null});
    }
    await refreshPending();return marker;
  }
  async function beginRemoval(confirmation){
    const s=scope;if(!s)throw Error('Sign in to the account you want to remove.');
    emit({removalBusyOwner:s.owner,error:''});
    try{return await removalClient.start(s.owner,confirmation);}catch(e){if(alive(s))emit({error:e.message});throw e;}finally{await refreshRemoval(s.owner);if(state.removalBusyOwner===s.owner)emit({removalBusyOwner:null});}
  }
  async function resumeRemoval(){
    const s=scope;if(!s)throw Error('Sign in to the same account to continue removal.');
    emit({removalBusyOwner:s.owner,error:''});
    try{return await removalClient.resume(s.owner);}catch(e){if(alive(s))emit({error:e.message});throw e;}finally{await refreshRemoval(s.owner);if(state.removalBusyOwner===s.owner)emit({removalBusyOwner:null});}
  }
  async function checkRemovals(){
    const result=await removalClient.check();await refreshPending();
    emit({removalNotice:result.remaining?`${result.remaining} removal ${result.remaining===1?'request is':'requests are'} not yet confirmed. Sign in to the same account to continue.`:'Account removal confirmed. Guest saves are unchanged.'});return result;
  }
  function clearScope(){clearTimeout(timer);scope?.worker.stop();scope?.cloud.close();scope?.journal.close();scope?.channel?.close();scope=null;}
  function schedule(delay=100,reset=true){
    if(!scope||scope.halted||closed)return;if(reset)retries=0;clearTimeout(timer);const s=scope;
    timer=setTimeout(()=>{if(alive(s))sync();},delay);
  }
  async function sync(){
    const s=scope;if(!s||closed)return;
    if(s.halted)return {status:'account-removing'};
    if(s.run){if(s.workerStarted)void s.worker.run();return s.run;}
    s.run=(async()=>{
      if(await refreshRemoval(s.owner)||!alive(s))return {status:'account-removing'};
      if(globalThis.navigator?.onLine===false){emit({phase:'offline',error:'Offline. Your visits and photos stay on this device; changes will sync after you reconnect.'});return {status:'offline'};}
      s.workerStarted=true;const report=await s.worker.run();if(!alive(s)||s.halted)return report;
      emit({phase:report.status,error:report.errors?.[0]?.message||'',...(report.status==='idle'?{lastSyncedAt:new Date().toISOString()}:{}),refresh:(state.refresh||0)+1});
      if(report.status==='offline'&&retries<3&&globalThis.navigator?.onLine!==false)schedule([2000,10000,30000][retries++],false);
      return report;
    })().catch(e=>{if(alive(s)&&!s.halted)emit({phase:'attention',error:e.message});}).finally(()=>{s.run=null;s.workerStarted=false;});
    return s.run;
  }
  function cachedSession(){
    try{if(globalThis.location&&new URL(location.href).searchParams.has('code'))return null;}catch{}
    return hint.read()?.session||null;
  }
  function changed(event,session,localOnly=false){
    if(closed||session&&(signingOut||hint.isSignedOut()))return;
    if(event==='SIGNED_OUT')hint.forget();
    if(!session&&event==='INITIAL_SESSION'){session=cachedSession();localOnly=!!session;}
    authGeneration++;current=session;
    let owner;try{owner=session?accountId(session.user.id):null;}catch{owner=null;current=null;}
    if(owner===state.owner&&state.phase!=='loading'){
      if(owner){
        if(!localOnly)hint.remember(session);
        emit({user:{email:session.user.email||''},localOnly,...(!localOnly?{error:''}:{})});
        if(!localOnly&&['SIGNED_IN','TOKEN_REFRESHED'].includes(event))schedule(0);
      }
      return;
    }
    clearScope();retries=0;
    if(!owner){emit({key:'guest',owner:null,store:null,user:null,phase:'local',error:'',lastSyncedAt:null,localOnly:false,removal:null});void refreshPending();return;}
    if(!localOnly)hint.remember(session);
    const journal=createAccountJournal(owner),s={journal,owner,run:null};scope=s;
    const getSession=async()=>{
      if(!alive(s)||current?.user.id!==owner)return null;
      const {data,error}=await auth.getSession();if(error)throw error;
      if(!alive(s)||current?.user.id!==owner||data.session?.user.id!==owner)return null;
      return data.session;
    };
    s.cloud=createCloudJournal({url,publishableKey,owner,getSession,fetch:fetcher});
    s.worker=createJournalSync({journal,cloud:s.cloud,onProgress:progress=>{if(alive(s)&&!s.halted&&state.phase!==progress.phase)emit({phase:progress.phase});}});
    const mutate=method=>async(...args)=>{journal.assertActive();const result=await journal[method](...args);journal.assertActive();schedule();return result;};
    const store={...journal,channelName:`boredone-account:${owner}`,save:mutate('save'),importLegacy:mutate('importLegacy'),resolveConflict:mutate('resolveConflict'),
      readDrafts:journal.readDrafts,backup:accountBackup,validateBackup:readAccountBackup,backupLimit:ACCOUNT_BACKUP_BYTES,
      validateOuting:(value,original)=>canonicalAccountOuting(value,value.visitDate===original?.visitDate)};
    try{if(typeof BroadcastChannel!=='undefined'){s.channel=new BroadcastChannel(store.channelName);s.channel.onmessage=async()=>{
      try{if(await refreshRemoval(owner))return;const index=await journal.syncIndex();if(alive(s)&&index.ready)schedule();}catch{/* Closed scopes are intentionally silent. */}
    };}}catch{}
    emit({key:`account:${owner}`,owner,store,user:{email:session.user.email||''},phase:localOnly?'offline':'pending',error:localOnly?'Your account’s saved copy is available on this device. Reconnect or sign in again to resume syncing.':'',lastSyncedAt:null,localOnly,removal:null,removalNotice:'',removalBusyOwner:null});
    // Auth callbacks stay synchronous; network work starts after callback return.
    schedule(0);
  }
  const storageChanged=event=>{if(event.key===hint.hintKey&&hint.isSignedOut())changed('SIGNED_OUT',null);};
  const resume=()=>{if(!globalThis.document||document.visibilityState==='visible'){schedule(0);void refreshPending();}};
  async function start(){
    const callbackAtStart=globalThis.location?new URL(location.href):null;
    function finishCallback(){
      if(closed||callbackAtStart?.searchParams.get('auth')!=='callback'||!globalThis.location)return;
      const callback=new URL(location.href);
      if(callback.origin!==callbackAtStart.origin||callback.pathname!==callbackAtStart.pathname||callback.searchParams.get('auth')!=='callback')return;
      const parameters=['code','sb_flow_id','error','error_description','error_code'];
      // The SDK may already have consumed code/flow ID. Never consume a newer
      // callback if navigation changed while this initialization was pending.
      if(parameters.some(key=>callback.searchParams.has(key)&&callback.searchParams.get(key)!==callbackAtStart.searchParams.get(key)))return;
      for(const key of ['auth',...parameters])callback.searchParams.delete(key);
      globalThis.history?.replaceState(history.state,'',callback.pathname+callback.search+callback.hash);
    }
    if(hint.isSignedOut())changed('SIGNED_OUT',null);
    else {const cached=cachedSession();if(cached)changed('LOCAL_CACHE',cached,true);}
    subscription=auth.onAuthStateChange(changed).data.subscription;
    globalThis.addEventListener?.('storage',storageChanged);globalThis.addEventListener?.('online',resume);globalThis.addEventListener?.('focus',resume);globalThis.document?.addEventListener('visibilitychange',resume);
    const generation=authGeneration;
    const load=(async()=>{
      try{
        const {data,error}=await auth.getSession();if(closed)return;if(error)throw error;
        if(authGeneration===generation)changed('INITIAL_SESSION',data.session);
        const initialized=await auth.initialize?.();if(initialized?.error)throw initialized.error;
      }catch{if(!closed){if(!state.owner)changed('INITIAL_SESSION',null);emit({error:'Sign-in could not be restored. Your saved journals are unchanged. Try signing in again.'});}}
      finally{finishCallback();}
    })();
    await Promise.race([load,new Promise(resolve=>{startTimer=setTimeout(()=>{
      if(!closed&&state.phase==='loading'){
        const cached=cachedSession();
        if(cached)changed('LOCAL_CACHE',cached,true);
        else emit({phase:'local',error:'Sign-in is taking too long. This device’s saves are available while the connection recovers.'});
      }
      resolve();
    },8000);})]);
    clearTimeout(startTimer);
    void refreshPending();return state;
  }
  async function signIn(){
    if(closed)throw Error('Account controls are closed.');
    if(hint.isSignedOut()){await auth.signOut({scope:'local'});hint.allowSignIn();}
    const {data,error}=await auth.signInWithOAuth({provider:'google',options:{redirectTo:`${location.origin}/?auth=callback#settings`,queryParams:{prompt:'select_account'},skipBrowserRedirect:true}});
    if(error)throw Error('Google sign-in could not start. Try again when you are online.');
    const target=new URL(data.url);if(target.origin!==base.origin||target.pathname!=='/auth/v1/authorize')throw Error('The sign-in service returned an unexpected address.');
    location.assign(target.href);
  }
  async function signOut(){
    signingOut=true;hint.forget();changed('SIGNED_OUT',null);
    try{const {error}=await auth.signOut({scope:'local'});if(error)emit({error:'Signed out on this device. The server could not confirm session revocation; reconnect to Google before using a shared device.'});}
    finally{signingOut=false;}
  }
  function close(){closed=true;removalClient.close();clearTimeout(startTimer);clearScope();subscription?.unsubscribe();if(auth.dispose)void auth.dispose();else void auth.stopAutoRefresh?.();globalThis.removeEventListener?.('storage',storageChanged);globalThis.removeEventListener?.('online',resume);globalThis.removeEventListener?.('focus',resume);globalThis.document?.removeEventListener('visibilitychange',resume);}
  return {start,signIn,signOut,sync,beginRemoval,resumeRemoval,checkRemovals,close};
}
