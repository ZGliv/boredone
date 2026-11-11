import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createLocalAccountHint} from '../src/localAccountHint.js';
import {sessionFor} from './helpers/cloud-fixture.js';
const url='https://fixture.supabase.co';
function setup(){const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};return {data,storage,hint:createLocalAccountHint(url,storage)};}
function expired(){const s=sessionFor(randomUUID(),1);return {...s,refresh_token:'fixture-refresh',user:{...s.user,email:'fixture@example.com'}};}
test('expired credential can identify the previously used local cache without duplicating credentials',()=>{
  const {data,hint}=setup(),s=expired();hint.remember(s);data.set(hint.authKey,JSON.stringify(s));
  assert.equal(hint.read().owner,s.user.id);const stored=data.get(hint.hintKey);assert.equal(stored.includes(s.access_token),false);assert.equal(stored.includes(s.refresh_token),false);
});
test('a credential alone cannot open a cache that this app has not previously remembered',()=>{
  const {data,hint}=setup();data.set(hint.authKey,JSON.stringify(expired()));assert.equal(hint.read(),null);
});
test('removing the hint on sign-out prevents recovery even while an old credential is still being removed',()=>{
  const {data,hint}=setup(),s=expired();hint.remember(s);data.set(hint.authKey,JSON.stringify(s));hint.forget();assert.equal(hint.read(),null);assert.ok(data.has(hint.authKey));
});
test('changed account, missing credential, inconsistent JWT and malformed storage cannot select another cache',()=>{
  const {data,hint}=setup(),s=expired();hint.remember(s);
  assert.equal(hint.read(),null);data.set(hint.authKey,JSON.stringify(expired()));assert.equal(hint.read(),null);
  data.set(hint.authKey,JSON.stringify({...s,user:{...s.user,id:randomUUID()}}));assert.equal(hint.read(),null);
  data.set(hint.authKey,'{broken');assert.equal(hint.read(),null);
  data.set(hint.authKey,JSON.stringify({...s,refresh_token:''}));assert.equal(hint.read(),null);
});
test('project hints stay separate and denied local storage is optional',()=>{
  const {data,storage,hint}=setup(),s=expired();hint.remember(s);data.set(hint.authKey,JSON.stringify(s));assert.equal(createLocalAccountHint('https://other.supabase.co',storage).read(),null);
  const blocked=createLocalAccountHint(url,{getItem(){throw Error('denied');},setItem(){throw Error('denied');},removeItem(){throw Error('denied');}});
  blocked.remember(s);blocked.forget();assert.equal(blocked.read(),null);
});
test('explicit sign-out blocks late SDK events until its old credential has been cleared',()=>{
  const {data,hint}=setup(),s=expired();hint.remember(s);data.set(hint.authKey,JSON.stringify(s));hint.forget();
  assert.equal(hint.isSignedOut(),true);hint.remember(s);assert.equal(hint.read(),null);
  assert.throws(()=>hint.allowSignIn(),/still closing/);data.delete(hint.authKey);hint.allowSignIn();
  assert.equal(hint.isSignedOut(),false);data.set(hint.authKey,JSON.stringify(s));hint.remember(s);assert.equal(hint.read().owner,s.user.id);
});
