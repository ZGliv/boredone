import test from 'node:test';
import assert from 'node:assert/strict';
import {createJournalSession} from '../src/journalSession.js';
import {createLocalAccountHint} from '../src/localAccountHint.js';
import {sessionFor} from './helpers/cloud-fixture.js';
const url='https://bordone-fixture.supabase.co',publishableKey='sb_publishable_fixture_only';
function setup(extra={}){
  let options,assigned,unsubscribed=false;
  globalThis.location={origin:'https://boredone.example',href:'https://boredone.example/#settings',assign:value=>assigned=value};
  const states=[];
  const auth={onAuthStateChange(){return {data:{subscription:{unsubscribe(){unsubscribed=true;}}}};},getSession:async()=>({data:{session:null}}),signInWithOAuth:async value=>{options=value;return {data:{url:`${url}/auth/v1/authorize?provider=google`}};},signOut:async()=>({error:null}),stopAutoRefresh(){},...extra};
  const controller=createJournalSession({url,publishableKey,auth,onChange:s=>states.push(s)});
  return {controller,auth,states,values:()=>({options,assigned,unsubscribed})};
}
test('Google sign-in uses only selected provider, PKCE-compatible callback and same-project authorize URL',async()=>{
  const p=setup();try{await p.controller.start();await p.controller.signIn();
    const {options,assigned}=p.values();assert.equal(options.provider,'google');assert.equal(options.options.redirectTo,'https://boredone.example/?auth=callback#settings');
    assert.equal(options.options.skipBrowserRedirect,true);assert.equal(options.options.scopes,undefined);assert.equal(assigned,`${url}/auth/v1/authorize?provider=google`);
    assert.equal(p.states.at(-1).owner,null);
  }finally{p.controller.close();delete globalThis.location;}
  assert.equal(p.values().unsubscribed,true);
});
test('unexpected OAuth redirect destination is never followed',async()=>{
  const p=setup({signInWithOAuth:async()=>({data:{url:'https://unrelated.example/login'}})});
  try{await assert.rejects(()=>p.controller.signIn(),/unexpected/);assert.equal(p.values().assigned,undefined);}finally{p.controller.close();delete globalThis.location;}
});
test('unavailable authentication leaves guest saves accessible with an honest error',async()=>{
  const p=setup({getSession:async()=>{throw Error('offline');}});
  try{await p.controller.start();assert.equal(p.states.at(-1).owner,null);assert.match(p.states.at(-1).error,/unchanged/);}finally{p.controller.close();delete globalThis.location;}
});
test('slow authentication cannot indefinitely block the existing device journal',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const p=setup({getSession:()=>new Promise(()=>{})});
  try{const starting=p.controller.start();t.mock.timers.tick(8001);await starting;assert.equal(p.states.at(-1).phase,'local');assert.match(p.states.at(-1).error,/taking too long/);}finally{p.controller.close();delete globalThis.location;}
});
test('invalid project URLs and privileged keys fail before creating an auth client',()=>{
  assert.throws(()=>createJournalSession({url:'https://project.supabase.co/other',publishableKey,onChange(){}}),/Invalid/);
  assert.throws(()=>createJournalSession({url,publishableKey:'sb_secret_never_in_browser',onChange(){}}),/publishable/);
});

test('an explicit logout barrier rejects a late or reloaded SDK session until a fresh sign-in clears credentials',async()=>{
  const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const hint=createLocalAccountHint(url,storage),session={...sessionFor('12345678-1234-4234-8234-123456789abc'),refresh_token:'fixture-refresh'};
  hint.remember(session);values.set(hint.authKey,JSON.stringify(session));hint.forget();
  let callback,assigned,signOuts=0;const states=[];
  globalThis.location={origin:'https://boredone.example',href:'https://boredone.example/#settings',assign:v=>assigned=v};
  const auth={onAuthStateChange(fn){callback=fn;return {data:{subscription:{unsubscribe(){}}}};},async getSession(){return {data:{session}};},async signOut(){signOuts++;values.delete(hint.authKey);callback('SIGNED_OUT',null);return {error:null};},async signInWithOAuth(){return {data:{url:`${url}/auth/v1/authorize?provider=google`}};}};
  const controller=createJournalSession({url,publishableKey,auth,localHint:hint,onChange:s=>states.push(s)});
  try{
    await controller.start();callback('SIGNED_IN',session);assert.ok(states.every(s=>s.owner===null));assert.equal(states.at(-1).phase,'local');
    await controller.signIn();assert.equal(signOuts,1);assert.equal(hint.isSignedOut(),false);assert.equal(assigned,`${url}/auth/v1/authorize?provider=google`);
  }finally{controller.close();delete globalThis.location;}
});
test('a remembered device copy opens immediately while session refresh is still pending',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},hint=createLocalAccountHint(url,storage);
  const session={...sessionFor('12345678-1234-4234-8234-123456789abc',1),refresh_token:'fixture-refresh'};hint.remember(session);values.set(hint.authKey,JSON.stringify(session));
  const states=[],auth={onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};},getSession:()=>new Promise(()=>{})};
  const controller=createJournalSession({url,publishableKey,auth,localHint:hint,onChange:s=>states.push(s)});
  try{
    const opening=controller.start();assert.equal(states[0].owner,session.user.id);assert.equal(states[0].localOnly,true);
    t.mock.timers.tick(8001);await opening;assert.equal(states.at(-1).owner,session.user.id);
  }finally{controller.close();}
});

test('slow callback keeps its code until authentication settles, then cleans only callback parameters',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let finish;
  const pending=new Promise(resolve=>finish=resolve),p=setup({getSession:()=>pending});
  const original='https://boredone.example/?auth=callback&code=fixture-code&sb_flow_id=fixture-flow&preview=keep#settings';
  location.href=original;const replacements=[];globalThis.history={state:{keep:true},replaceState:(state,_,url)=>replacements.push({state,url})};
  try{
    const opening=p.controller.start();t.mock.timers.tick(8001);await opening;
    assert.deepEqual(replacements,[],'UI deadline must not consume a pending OAuth callback');
    finish({data:{session:null}});await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(replacements,[{state:{keep:true},url:'/?preview=keep#settings'}]);
  }finally{p.controller.close();delete globalThis.location;delete globalThis.history;}
});
test('a late auth result cannot scrub a different callback or rewrite a navigated route',async t=>{
  for(const later of ['https://boredone.example/?auth=callback&code=another-code#settings','https://boredone.example/elsewhere?auth=callback&code=fixture-code#find']){
    let finish;const pending=new Promise(resolve=>finish=resolve),p=setup({getSession:()=>pending});
    location.href='https://boredone.example/?auth=callback&code=fixture-code#settings';
    const replacements=[];globalThis.history={replaceState:(...args)=>replacements.push(args)};
    try{const opening=p.controller.start();location.href=later;finish({data:{session:null}});await opening;assert.deepEqual(replacements,[]);}
    finally{p.controller.close();delete globalThis.location;delete globalThis.history;}
  }
});
test('failed callback is cleaned after failure while keeping an honest retry message',async()=>{
  const p=setup({initialize:async()=>({error:Error('expired callback')})});
  location.href='https://boredone.example/?auth=callback&error=access_denied&error_description=fixture#settings';
  let cleaned;globalThis.history={replaceState:(_,__,url)=>cleaned=url};
  try{await p.controller.start();assert.equal(cleaned,'/#settings');assert.match(p.states.at(-1).error,/signing in again/);}
  finally{p.controller.close();delete globalThis.location;delete globalThis.history;}
});
