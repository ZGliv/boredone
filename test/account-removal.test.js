import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {removeAccount,removalInput,accountRemovalHandler} from '../server/account-removal.js';
const env={SUPABASE_URL:'https://removal-fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_removal_fixture_only',SUPABASE_SECRET_KEY:'sb_secret_removal_fixture_only'};
const token='fixture-user-access-token-only';
// Protocol fixture only: not hosted Auth, RLS or object storage verification.
function fixture(count=2){
  const owner=randomUUID(),requestId=randomUUID(),other=randomUUID(),files=new Map(),calls=[];
  for(let i=0;i<count;i++){const id=randomUUID();files.set(`${owner}/${id}.jpg`,{id,name:`${id}.jpg`});}
  const foreign=`${other}/${randomUUID()}.jpg`;files.set(foreign,{id:randomUUID(),name:foreign.split('/')[1]});
  const state={exists:true,job:null,lostRemove:false,lostDelete:false,failList:false,stall:false,badEntry:false,wrongUser:false,authOutage:false};
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
  async function fetch(url,options={}){
    const u=new URL(url),h=new Headers(options.headers),body=options.body?JSON.parse(options.body):null;
    calls.push({path:u.pathname,method:options.method,body,headers:h});assert.equal(u.origin,env.SUPABASE_URL);assert.equal(options.cache,'no-store');
    if(state.stall)return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('fixture timeout','AbortError')),{once:true}));
    if(u.pathname==='/auth/v1/user'){
      assert.equal(h.get('apikey'),env.SUPABASE_PUBLISHABLE_KEY);assert.equal(h.get('authorization'),`Bearer ${token}`);
      if(state.authOutage)throw new TypeError('fixture offline');
      return state.exists?json({id:state.wrongUser?other:owner}):json({message:'fixture account absent',code:'user_not_found'},401);
    }
    assert.equal(h.get('apikey'),env.SUPABASE_SECRET_KEY);assert.equal(h.get('authorization'),`Bearer ${env.SUPABASE_SECRET_KEY}`);
    if(u.pathname==='/rest/v1/rpc/journal_account_removal'){
      assert.equal(body.p_owner,owner);
      if(body.p_action==='begin')state.job||={status:'pending',requestId:body.p_request_id};
      if(body.p_action==='status'&&state.job?.requestId!==body.p_request_id)return json(null);
      if(state.job&&!state.exists&&![...files.keys()].some(k=>k.startsWith(owner+'/')))state.job.status='complete';
      return json(state.job);
    }
    if(u.pathname==='/storage/v1/object/list/journal-photos-v1'){
      assert.equal(body.prefix,owner);assert.equal(body.offset,0);assert.equal(body.limit,200);
      if(state.failList)return json({message:'fixture list unavailable'},503);
      if(state.badEntry)return json([{id:null,name:'unexpected-folder'}]);
      return json([...files.entries()].filter(([k])=>k.startsWith(owner+'/')).slice(0,200).map(([,v])=>v));
    }
    if(u.pathname==='/storage/v1/object/journal-photos-v1'&&options.method==='DELETE'){
      assert.equal(state.job?.status,'pending');
      for(const path of body.prefixes){assert.ok(path.startsWith(owner+'/'));files.delete(path);}
      if(state.lostRemove){state.lostRemove=false;throw new TypeError('fixture lost removal response');}return json([]);
    }
    if(u.pathname===`/auth/v1/admin/users/${owner}`&&options.method==='GET')return state.exists?json({id:owner}):json({message:'fixture account absent'},404);
    if(u.pathname===`/auth/v1/admin/users/${owner}`&&options.method==='DELETE'){
      assert.equal(state.job?.status,'pending');assert.equal([...files.keys()].filter(k=>k.startsWith(owner+'/')).length,0);assert.equal(body.should_soft_delete,false);
      state.exists=false;if(state.lostDelete){state.lostDelete=false;throw new TypeError('fixture lost final response');}return json({id:owner});
    }
    throw Error(`Unexpected fixture request ${options.method} ${u.pathname}`);
  }
  const input={owner,requestId,action:'start',confirmation:'DELETE'};
  let protocolError;
  const checkedFetch=async(...args)=>{try{return await fetch(...args);}catch(e){if(e.code==='ERR_ASSERTION'||e.message.startsWith('Unexpected fixture request'))protocolError=e;throw e;}};
  const run=async(action='continue',overrides={})=>{protocolError=null;try{const result=await removeAccount({...input,action,...overrides},token,{env,fetch:checkedFetch});if(protocolError)throw protocolError;return result;}catch(e){throw protocolError||e;}};
  return {owner,requestId,files,foreign,state,calls,run,input,fetch};
}
test('removal is explicit, server-configured and bound to a remotely verified owner',async()=>{
  const p=fixture();await assert.rejects(()=>p.run('start',{confirmation:'yes'}),{status:400});
  await assert.rejects(()=>p.run('start',{bucket:'another'}),{status:400});
  await assert.rejects(()=>removeAccount(p.input,token,{env:{},fetch:p.fetch}),{status:503,code:'not_configured'});
  assert.equal(p.calls.length,0);p.state.wrongUser=true;await assert.rejects(()=>p.run('start'),{status:409,code:'account_changed'});
  assert.equal(p.state.job,null);assert.equal(p.calls.length,1);
});
test('start freezes intent without deleting files; continuation removes own files then Auth and confirms completion',async()=>{
  const p=fixture();assert.deepEqual(await p.run('start'),{status:'pending',requestId:p.requestId});assert.equal(p.files.size,3);assert.equal(p.state.exists,true);
  const result=await p.run();assert.deepEqual(result,{status:'complete',requestId:p.requestId});assert.equal(p.files.size,1);assert.ok(p.files.has(p.foreign));assert.equal(p.state.exists,false);
  const deletion=p.calls.findIndex(c=>c.path.includes('/admin/users/'));const lastList=p.calls.findLastIndex(c=>c.path.includes('/object/list/'));assert.ok(deletion>lastList);
});
test('lost file-removal response retries without touching another account or deleting Auth early',async()=>{
  const p=fixture();await p.run('start');p.state.lostRemove=true;await assert.rejects(()=>p.run(),{status:503,code:'retry_removal'});assert.equal(p.state.exists,true);
  assert.equal((await p.run()).status,'complete');assert.ok(p.files.has(p.foreign));
});
test('lost final Auth response is confirmed by an exact completion receipt without an active login',async()=>{
  const p=fixture();await p.run('start');p.state.lostDelete=true;await assert.rejects(()=>p.run(),{status:503});assert.equal(p.state.exists,false);
  await assert.rejects(()=>p.run('continue',{requestId:randomUUID()}),{status:401});
  assert.equal((await p.run()).status,'complete');assert.equal(p.calls.filter(c=>c.path.includes('/admin/users/')&&c.method==='DELETE').length,1);
});
test('an invalid session and pending receipt can never continue destructive work',async()=>{
  const p=fixture();await p.run('start');p.state.exists=false;await assert.rejects(()=>p.run(),{status:401});
  assert.equal(p.files.size,3);assert.equal(p.calls.filter(c=>c.method==='DELETE').length,0);
});
test('listing failures and unexpected folders stop safely before deleting Auth',async()=>{
  for(const problem of ['failList','badEntry']){const p=fixture();await p.run('start');p.state[problem]=true;await assert.rejects(()=>p.run(),{status:503});assert.equal(p.state.exists,true);assert.equal(p.files.size,3);}
});
test('large removals make bounded progress and resume from offset zero',async()=>{
  const p=fixture(1001);await p.run('start');const first=await p.run();assert.equal(first.status,'pending');assert.equal(first.removed,1000);assert.equal(p.state.exists,true);
  assert.equal((await p.run()).status,'complete');assert.equal(p.files.size,1);
});
test('authentication outages remain retryable and deadlines stop before any mutation',async()=>{
  const p=fixture();p.state.authOutage=true;await assert.rejects(()=>p.run('start'),{status:503,code:'retry_removal'});assert.equal(p.state.job,null);
  p.state.authOutage=false;p.state.stall=true;
  await assert.rejects(()=>removeAccount(p.input,token,{env,fetch:p.fetch,timeoutMs:10}),{status:503,code:'retry_removal'});assert.equal(p.state.job,null);
});
test('a new device may recover the existing intent but continuation must have its exact receipt',async()=>{
  const p=fixture();await p.run('start');assert.equal((await p.run('start',{requestId:randomUUID()})).requestId,p.requestId);
  await assert.rejects(()=>p.run('continue',{requestId:randomUUID()}),{status:409,code:'start_required'});assert.equal(p.files.size,3);
});
test('HTTP boundary rejects methods, content type, unbounded bodies and absent authorization without caching responses',async()=>{
  async function request(method,headers,raw){const req=Readable.from([raw]);Object.assign(req,{method,headers});const response={headers:{},setHeader(k,v){this.headers[k]=v;},end(value){this.body=JSON.parse(value);}};await accountRemovalHandler(req,response);return response;}
  for(const [method,headers,raw,status] of [['GET',{},'',405],['POST',{},'',415],['POST',{'content-type':'application/json'},'x'.repeat(513),413],['POST',{'content-type':'application/json'},'{}',401]]){
    const response=await request(method,headers,raw);assert.equal(response.statusCode,status);assert.match(response.headers['Cache-Control'],/no-store/);assert.equal(response.headers.Vary,'Authorization');
  }
  assert.throws(()=>removalInput({owner:[],requestId:randomUUID(),action:'start',confirmation:'DELETE'}),{status:400});
});

test('the opaque receipt can check status after credentials disappear, but cannot start or continue deletion',async()=>{
  const p=fixture();await p.run('start');const before=p.calls.length;
  const status=()=>removeAccount({...p.input,action:'status'},null,{env,fetch:p.fetch});
  assert.equal((await status()).status,'pending');assert.equal(p.files.size,3);
  assert.ok(p.calls.slice(before).every(c=>c.path==='/rest/v1/rpc/journal_account_removal'&&c.body.p_action==='status'));
  await assert.rejects(()=>removeAccount({...p.input,action:'continue'},null,{env,fetch:p.fetch}),{status:401});
  await assert.rejects(()=>removeAccount({...p.input,action:'status',requestId:randomUUID()},null,{env,fetch:p.fetch}),{status:404});
  await p.run();assert.equal((await status()).status,'complete');
});
