import test from 'node:test';
import assert from 'node:assert/strict';
import {accountBackup,readAccountBackup} from '../src/accountBackup.js';
import {makeOuting,backupPayload,validateBackup} from '../src/model.js';
const photo='data:image/jpeg;base64,/9j/2Q==';
const visit=()=>({...makeOuting({id:'p',name:'A real schema test',source:'You'}),status:'visited',visitDate:'2026-01-01',photos:[photo,photo]});
test('account exports store repeated photo bytes only once and restore exact visits',()=>{
  const first=visit(),second={...visit(),with:'Friend'},backup=accountBackup({outings:[first,second]});
  assert.equal(backup.version,2);assert.deepEqual(backup.photos,[photo]);assert.deepEqual(backup.outings.map(o=>o.photos),[[0,0],[0,0]]);
  assert.deepEqual(readAccountBackup(JSON.parse(JSON.stringify(backup))),[first,second]);
});
test('account importer accepts existing v1 saves without changing guest format',()=>{
  const v=visit(),backup=backupPayload({outings:[v]});assert.deepEqual(readAccountBackup(backup),[v]);assert.deepEqual(validateBackup(backup),[v]);
  assert.throws(()=>validateBackup(accountBackup({outings:[v]})),/version 1/);
});
test('account imports reject missing references, invalid photos, duplicate visits and unsupported formats',()=>{
  const b=accountBackup({outings:[visit()]});
  assert.throws(()=>readAccountBackup({...b,photos:[]}),/missing/);
  assert.throws(()=>readAccountBackup({...b,photos:['https://example.com/photo.jpg']}),/photo/);
  assert.throws(()=>readAccountBackup({...b,outings:[b.outings[0],b.outings[0]]}),/duplicate/);
  assert.throws(()=>readAccountBackup({...b,version:3}),/Boredone/);
  assert.throws(()=>readAccountBackup({...b,outings:[{...b.outings[0],photos:['0']}]}),/missing/);
});
test('account round-trip retains stored calendar dates across timezone boundaries',()=>{
  const v={...visit(),visitDate:'2099-01-01'};assert.deepEqual(readAccountBackup(accountBackup({outings:[v]})),[v]);
  assert.throws(()=>validateBackup(backupPayload({outings:[v]})),/future/);
});
