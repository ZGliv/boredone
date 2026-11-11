import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

// A fresh, socket-only disposable PostgreSQL cluster. Never connects to a user's
// running service, hosted project or supplied DATABASE_URL. Set PG_BIN if needed.
const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'bordone-journal-db-'));
const bin = (name) => process.env.PG_BIN ? join(process.env.PG_BIN, name) : name;
const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))), PGHOST: dir, PGPORT: '5432', PGUSER: 'bordone_test', PGDATABASE: 'postgres', PGPASSFILE: '/dev/null', LC_ALL: 'C' };
let started = false;
const a = randomUUID(), b = randomUUID(), outsider = randomUUID();
const quote = (s) => `'${String(s).replaceAll("'", "''")}'`;
function sql(query, actor, role = actor ? 'authenticated' : '') {
  const prefix = `${role ? `set role ${role};` : ''}${actor ? `select set_config('request.jwt.claim.sub',${quote(actor)},false);` : ''}`;
  return execFileSync(bin('psql'), ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {env, input: prefix + query, encoding: 'utf8', timeout: 15000, stdio: ['pipe','pipe','pipe']}).trim().split('\n').filter(x => x !== actor).join('\n');
}
function fail(query, actor, pattern, role) {
  assert.throws(() => sql(query, actor, role), e => pattern.test(e.stderr?.toString() || e.message));
}
const payload = { place: {id: 'legacy osm/123', name: 'Test visit', lat: 40.44, lng: -80}, status:'visited', planDate:'', visitDate:'2026-01-02', notes:'', with:'A friend', rating:0, createdAt:'2026-01-02T13:00:00.000Z', updatedAt:'2026-01-02T13:00:00.000Z' };
const json = v => v === null ? 'null' : `${quote(JSON.stringify(v))}::jsonb`;
const photoArray = ids => `array[${ids.map(quote).join(',')}]::uuid[]`;
function save(id, rev = 0, mutation = randomUUID(), value = payload, photos = [], deleted = false) {
  return `select row_to_json(r) from public.save_journal_visit(auth.uid(),${quote(id)},${rev},${quote(mutation)},${json(value)},${photoArray(photos)},${deleted}) r;`;
}
function prepare(id, size = 100, hash = 'a'.repeat(64), mime = 'image/jpeg') {
  return `select row_to_json(r) from public.prepare_journal_photo(auth.uid(),${quote(id)},${quote(hash)},${quote(mime)},${size}) r;`;
}
function object(id, actor, size = 100, mime = 'image/jpeg') {
  return `insert into storage.objects(bucket_id,name,owner_id,metadata) values('journal-photos-v1',${quote(`${actor}/${id}.jpg`)},${quote(actor)},${json({size,mimetype:mime})});`;
}
function photo(actor = a) {
  const id = randomUUID(); sql(prepare(id), actor); sql(object(id,actor),actor); sql(`select public.finish_journal_photo(auth.uid(),'${id}');`, actor); return id;
}
function asyncSql(query, actor) {
  const child = spawn(bin('psql'), ['-X','-qAt','-v','ON_ERROR_STOP=1'], {env, stdio:['pipe','pipe','pipe']});
  let stdout = '', stderr = '';
  child.stdout.on('data',d=>stdout+=d); child.stderr.on('data',d=>stderr+=d);
  child.stdin.end(`set role authenticated; select set_config('request.jwt.claim.sub','${actor}',false); ${query}`);
  const finished = new Promise((resolve,reject)=>{ child.on('error',reject); child.on('close',code=>resolve({code,stdout,stderr})); });
  return {child, finished};
}

before(() => {
  execFileSync(bin('initdb'), ['-D',join(dir,'data'),'-U','bordone_test','--auth=trust','--no-locale','--encoding=UTF8'], {env,stdio:'pipe'});
  execFileSync(bin('pg_ctl'), ['-D',join(dir,'data'),'-l',join(dir,'postgres.log'),'-o',`-k ${dir} -h '' -p 5432`,'-w','start'], {env,stdio:'pipe'});
  started = true;
  assert.equal(sql("select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema');"), '0');
  sql(readFileSync(join(root,'test/database/harness.sql'),'utf8'));
  for (const filename of readdirSync(join(root,'supabase/migrations')).filter(x=>x.endsWith('.sql')).sort()) sql(readFileSync(join(root,'supabase/migrations',filename),'utf8'));
  sql(`insert into auth.users(id) values('${a}'),('${b}'),('${outsider}'); insert into bordone_private.journal_members(user_id) values('${a}'),('${b}');`);
});
after(() => {
  if (started) execFileSync(bin('pg_ctl'), ['-D',join(dir,'data'),'-m','fast','-w','stop'], {env,stdio:'pipe'});
  rmSync(dir,{recursive:true,force:true});
});

test('anonymous, nonmember, and missing identity cannot mutate; grants and RLS are explicit', () => {
  fail(save('denied'), null, /permission denied/, 'anon');
  fail(save('denied'), outsider, /journal_beta_access_required/);
  fail(save('denied'), null, /journal_account_changed/, 'authenticated');
  fail('select * from bordone_private.journal_members;',a,/permission denied/);
  fail(`insert into public.journal_visits(user_id,id,revision,mutation_id,payload) values('${a}','bypass',1,gen_random_uuid(),${json(payload)});`,a,/permission denied/);
  fail("delete from public.journal_visits;",a,/permission denied/);
  fail("update public.journal_assets set state='ready';",a,/permission denied/);
  assert.equal(sql("select bool_and(relrowsecurity) from pg_class where oid in ('public.journal_assets'::regclass,'public.journal_visits'::regclass,'bordone_private.journal_members'::regclass);"),'t');
  assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%journal%' and p.prosecdef;"),'0');
  assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='bordone_private' and p.prosecdef and not ('search_path=\"\"'=any(p.proconfig));"),'0');
});

test('legacy text IDs, dates, repeat visits and ordered photos round-trip without cross-account access', () => {
  const image = photo(a), image2 = photo(a), id = "legacy / visit ' 1";
  const first = JSON.parse(sql(save(id,0,randomUUID(),payload,[image2,image]),a));
  assert.equal(first.id,id); assert.equal(first.revision,1); assert.deepEqual(first.payload,payload); assert.deepEqual(first.photo_ids,[image2,image]);
  sql(save('repeat place',0,randomUUID(),payload,[image]),a);
  assert.equal(sql(`select count(*) from public.journal_visits where id=${quote(id)};`,b),'0');
  assert.equal(sql(`select count(*) from public.journal_assets where id='${image}';`,b),'0');
  assert.equal(sql(`select count(*) from storage.objects where name='${a}/${image}.jpg';`,b),'0');
  sql(save(id),b); // IDs are scoped by owner, so a legitimate collision is safe.
  assert.equal(sql(`select count(*) from public.journal_visits where id=${quote(id)};`,b),'1');
  fail(save('foreign photo',0,randomUUID(),payload,[image]),b,/journal_photos_not_ready/);
});

test('retries are idempotent and stale writes/deletes cannot overwrite newer edits', () => {
  const id = randomUUID(), token = randomUUID();
  const first = JSON.parse(sql(save(id,0,token),a));
  assert.deepEqual(JSON.parse(sql(save(id,0,token),a)), first);
  fail(save(id,0,token,{...payload,notes:'changed token payload'}),a,/journal_mutation_id_reused/);
  const newer = {...payload,notes:'Phone edit',updatedAt:'2026-01-02T15:00:00.000Z'};
  assert.equal(JSON.parse(sql(save(id,1,randomUUID(),newer),a)).revision,2);
  fail(save(id,1,randomUUID(),{...payload,notes:'Stale laptop'}),a,/journal_conflict/);
  assert.equal(sql(`do $test$ begin
    perform public.save_journal_visit(auth.uid(),'${id}',1,gen_random_uuid(),${json(payload)},array[]::uuid[],false);
    raise exception 'expected conflict';
  exception when sqlstate 'PT409' then
    if sqlerrm <> 'journal_conflict' then raise; end if;
  end $test$;`,a),'');
  fail(save(id,1,randomUUID(),null,[],true),a,/journal_conflict/);
  assert.deepEqual(JSON.parse(sql(`select payload from public.journal_visits where id='${id}';`,a)),newer);
});

test('deletion leaves a tombstone and cannot be resurrected by an old or new mutation', () => {
  const id = randomUUID(); sql(save(id),a);
  const token = randomUUID(), deleted = JSON.parse(sql(save(id,1,token,null,[],true),a));
  assert.equal(deleted.deleted,true); assert.equal(deleted.payload,null); assert.deepEqual(deleted.photo_ids,[]);
  assert.deepEqual(JSON.parse(sql(save(id,1,token,null,[],true),a)),deleted);
  fail(save(id),a,/journal_conflict/);
  fail(save(id,2),a,/journal_visit_deleted/);
});

test('photos must be uploaded and finalized before attaching; reservations are immutable and private', () => {
  const id = randomUUID(); sql(prepare(id),a);
  fail(save('not-uploaded',0,randomUUID(),payload,[id]),a,/journal_photos_not_ready/);
  fail(`select public.finish_journal_photo(auth.uid(),'${id}');`,a,/journal_photo_upload_incomplete/);
  fail(object(id,a),b,/row-level security/);
  fail(object(randomUUID(),a),a,/row-level security/);
  fail(object(id,a,101),a,/row-level security/);
  fail(prepare(id,101),a,/journal_photo_id_reused/);
  // Storage preflight has mime/contentLength, final write has measured size.
  assert.equal(sql(`select bordone_private.journal_storage_write('${a}/${id}.jpg','journal-photos-v1','{"mimetype":"image/jpeg","contentLength":100}',false);`,a),'t');
  sql(object(id,a),a);
  fail(save('not-finalized',0,randomUUID(),payload,[id]),a,/journal_photos_not_ready/);
  sql(`select public.finish_journal_photo(auth.uid(),'${id}');`,a);
  sql(`select public.finish_journal_photo(auth.uid(),'${id}');`,a);
  assert.equal(sql(`update storage.objects set metadata='{}' where name='${a}/${id}.jpg' returning name;`,a),'');
  fail(`select public.finish_journal_photo(auth.uid(),'${id}');`,b,/journal_photo_unavailable/);
});

test('in-use photos cannot be deleted; two-step deletion releases quota only after actual object removal', () => {
  const image = photo(a), visit = randomUUID();
  sql(save(visit,0,randomUUID(),payload,[image]),a);
  fail(`select public.begin_journal_photo_delete(auth.uid(),'${image}');`,a,/journal_photo_in_use/);
  assert.equal(sql(`delete from storage.objects where name='${a}/${image}.jpg' returning name;`,a),'');
  sql(save(visit,1,randomUUID(),null,[],true),a);
  sql(`select public.begin_journal_photo_delete(auth.uid(),'${image}');`,a);
  fail(save('new ref to deleting',0,randomUUID(),payload,[image]),a,/journal_photos_not_ready/);
  fail(`select public.finish_journal_photo_delete(auth.uid(),'${image}');`,a,/journal_photo_delete_incomplete/);
  assert.equal(sql(`delete from storage.objects where name='${a}/${image}.jpg' returning name;`,b),'');
  sql(`delete from storage.objects where name='${a}/${image}.jpg';`,a); // API-shaped fixture only; never do this in hosted DB.
  sql(`select public.finish_journal_photo_delete(auth.uid(),'${image}');`,a);
  sql(`select public.finish_journal_photo_delete(auth.uid(),'${image}');`,a);
  fail(prepare(image),a,/journal_photo_retired/);
  fail(object(image,a),a,/row-level security/);
});

test('abandoned reservations can retire safely and declared byte sizes cannot bypass reserved quota', () => {
  const owner = randomUUID(), id = randomUUID();
  sql(`insert into auth.users values('${owner}'); insert into bordone_private.journal_members(user_id,max_photo_bytes) values('${owner}',1050100);`);
  sql(prepare(id,1),owner);
  fail(prepare(randomUUID(),1),owner,/journal_photo_quota/);
  sql(`select public.begin_journal_photo_delete(auth.uid(),'${id}'); select public.finish_journal_photo_delete(auth.uid(),'${id}');`,owner);
  sql(prepare(randomUUID(),100),owner);
});

test('invalid or oversized visit data and photos do not create records', () => {
  for (const invalid of [null, {...payload,photos:['data:image/jpeg;base64,secret']}, {...payload,rating:1.5}, {...payload,visitDate:'2026-02-30'}, {...payload,visitDate:'2099-01-01'}, {...payload,with:'x'.repeat(201)}, {...payload,notes:'x'.repeat(6001)}, {...payload,place:{id:'',name:'Missing ID'}}, {...payload,place:{id:'a',name:'A',lat:100,lng:1}}]) {
    fail(save(randomUUID(),0,randomUUID(),invalid),a,/journal_invalid|journal_future/);
  }
  fail(save('too many photos',0,randomUUID(),payload,Array(25).fill(randomUUID())),a,/journal_invalid_mutation/);
  fail(prepare(randomUUID(),1050001),a,/journal_invalid_photo/);
  fail(prepare(randomUUID(),100,'bad hash'),a,/journal_invalid_photo/);
});

test('two devices racing the same revision produce one winner, not last-write-wins loss', async () => {
  const id = randomUUID(); sql(save(id),a);
  const one = asyncSql(`begin; ${save(id,1,randomUUID(),{...payload,notes:'one'})} select pg_sleep(0.15); commit;`,a);
  const two = asyncSql(save(id,1,randomUUID(),{...payload,notes:'two'}),a);
  const results = await Promise.all([one.finished,two.finished]);
  assert.equal(results.filter(r=>r.code===0).length,1);
  assert.match(results.find(r=>r.code!==0).stderr,/journal_conflict/);
  assert.equal(sql(`select revision from public.journal_visits where id='${id}';`,a),'2');
});

test('concurrent attach and retire cannot produce a live visit pointing at a deleting asset', async () => {
  for (let i=0;i<4;i++) {
    const image = photo(a), visit = randomUUID();
    const attach = asyncSql(save(visit,0,randomUUID(),payload,[image]),a);
    const remove = asyncSql(`select public.begin_journal_photo_delete(auth.uid(),'${image}');`,a);
    const results = await Promise.all([attach.finished,remove.finished]);
    assert.equal(results.filter(r=>r.code===0).length,1);
    assert.match(results.find(r=>r.code!==0).stderr,/journal_photo_in_use|journal_photos_not_ready/);
    assert.equal(sql(`select count(*) from public.journal_visits v join public.journal_assets a on a.user_id=v.user_id and a.id=any(v.photo_ids) where v.user_id='${a}' and v.id='${visit}' and not v.deleted and a.state <> 'ready';`),'0');
  }
});

test('private implementation entry points cannot bypass admission or spoof ownership', () => {
  fail(`select bordone_private.prepare_journal_photo('${randomUUID()}','${'a'.repeat(64)}','image/jpeg',100);`, outsider,/journal_beta_access_required/);
  fail(save('injected owner',0,randomUUID(),{...payload,user_id:b}),a,/journal_invalid_payload/);
  fail('select * from public.journal_visits;',null,/permission denied/,'anon');
  assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='bordone_private' and has_function_privilege('anon',p.oid,'execute');"),'0');
  sql(`update bordone_private.journal_members set enabled=false where user_id='${b}';`);
  fail(save('disabled'),b,/journal_beta_access_required/);
  assert.ok(Number(sql('select count(*) from public.journal_visits;',b)) > 0); // Own memories remain readable.
  sql(`update bordone_private.journal_members set enabled=true where user_id='${b}';`);
});

test('a shared photo remains protected until every referencing visit has been removed', () => {
  const image = photo(a), v1 = randomUUID(), v2 = randomUUID();
  sql(save(v1,0,randomUUID(),payload,[image]),a);
  sql(save(v2,0,randomUUID(),payload,[image]),a);
  sql(save(v1,1,randomUUID(),null,[],true),a);
  fail(`select public.begin_journal_photo_delete(auth.uid(),'${image}');`,a,/journal_photo_in_use/);
  sql(save(v2,1,randomUUID(),null,[],true),a);
  sql(`select public.begin_journal_photo_delete(auth.uid(),'${image}');`,a);
  fail(`select public.finish_journal_photo(auth.uid(),'${image}');`,a,/journal_photo_unavailable/);
});

test('finalization checks actual storage metadata even if an upload bypassed its policy', () => {
  const image = randomUUID(); sql(prepare(image),a);
  sql(object(image,a,101)); // Provider-shaped superuser fixture, deliberately wrong.
  fail(`select public.finish_journal_photo(auth.uid(),'${image}');`,a,/journal_photo_upload_incomplete/);
  sql(`update storage.objects set metadata='{"size":100,"mimetype":"image/png"}' where name='${a}/${image}.jpg';`);
  fail(`select public.finish_journal_photo(auth.uid(),'${image}');`,a,/journal_photo_upload_incomplete/);
  sql(`update storage.objects set metadata='{"size":100,"mimetype":"image/jpeg"}',owner_id='${b}' where name='${a}/${image}.jpg';`);
  fail(`select public.finish_journal_photo(auth.uid(),'${image}');`,a,/journal_photo_upload_incomplete/);
  sql(`update storage.objects set owner_id='${a}' where name='${a}/${image}.jpg';`);
  const once = sql(`select row_to_json(r) from public.finish_journal_photo(auth.uid(),'${image}') r;`,a);
  assert.equal(sql(`select row_to_json(r) from public.finish_journal_photo(auth.uid(),'${image}') r;`,a),once);
});

test('concurrent reservations cannot exceed an account quota', async () => {
  const owner = randomUUID();
  sql(`insert into auth.users values('${owner}'); insert into bordone_private.journal_members(user_id,max_photo_bytes) values('${owner}',1050100);`);
  const one = asyncSql(prepare(randomUUID(),1),owner), two = asyncSql(prepare(randomUUID(),1),owner);
  const results = await Promise.all([one.finished,two.finished]);
  assert.equal(results.filter(r=>r.code===0).length,1);
  assert.match(results.find(r=>r.code!==0).stderr,/journal_photo_quota/);
});

test('visit limits bound retained records without preventing edits or deletion', () => {
  const owner = randomUUID();
  sql(`insert into auth.users values('${owner}'); insert into bordone_private.journal_members(user_id) values('${owner}');
    insert into public.journal_visits(user_id,id,revision,mutation_id,payload)
    select '${owner}', 'seed-' || i, 1, gen_random_uuid(), ${json(payload)} from generate_series(1,500) i;`);
  fail(save('over-active-limit'),owner,/journal_visit_limit/);
  sql(save('seed-1',1,randomUUID(),{...payload,notes:'Edit allowed at cap'}),owner);
  sql(save('seed-2',1,randomUUID(),null,[],true),owner);
  sql(save('replacement'),owner);
  sql(`insert into public.journal_visits(user_id,id,revision,mutation_id,payload,deleted)
    select '${owner}', 'deleted-' || i, 1, gen_random_uuid(), null, true from generate_series(1,499) i;`);
  sql(save('seed-3',1,randomUUID(),null,[],true),owner);
  fail(save('over-retained-limit'),owner,/journal_visit_limit/);
  sql(save('seed-4',1,randomUUID(),{...payload,notes:'Still editable'}),owner);
});

test('a request prepared for account A is rejected if account B token is used', () => {
  const request = save('switched-account').replace('auth.uid(),', `'${a}',`);
  fail(request,b,/journal_account_changed/);
  assert.equal(sql("select count(*) from public.journal_visits where id='switched-account';",b),'0');
  fail(prepare(randomUUID()).replace('auth.uid(),',`'${a}',`),b,/journal_account_changed/);
  const asset=photo(a);
  for(const name of ['finish_journal_photo','begin_journal_photo_delete','finish_journal_photo_delete']){
    fail(`select public.${name}('${a}','${asset}');`,b,/journal_account_changed/);
  }
});

const removal=(owner,request,action='status')=>`select public.journal_account_removal('${owner}','${request}','${action}');`;
function removalOwner(){const owner=randomUUID();sql(`insert into auth.users values('${owner}'); insert into bordone_private.journal_members(user_id) values('${owner}');`);return owner;}
test('account removal coordination is server-only, idempotent and blocks every new write',()=>{
  const owner=removalOwner(),request=randomUUID(),reserved=randomUUID();sql(prepare(reserved),owner);const image=photo(owner);sql(save('before-removal',0,randomUUID(),payload,[image]),owner);
  for(const role of ['anon','authenticated'])fail(removal(owner,request,'begin'),owner,/permission denied/,role);
  fail('select * from bordone_private.journal_removals;',owner,/permission denied/);
  const job=JSON.parse(sql(removal(owner,request,'begin'),null,'service_role'));assert.deepEqual(job,{status:'pending',requestId:request});
  assert.deepEqual(JSON.parse(sql(removal(owner,randomUUID(),'begin'),null,'service_role')),job);
  assert.equal(sql(removal(owner,randomUUID()),null,'service_role'),'');
  fail(save('after-removal'),owner,/journal_account_removing/);
  fail(prepare(randomUUID()),owner,/journal_account_removing/);
  fail(object(reserved,owner),owner,/journal_account_removing/);
  fail(`select public.finish_journal_photo(auth.uid(),'${image}');`,owner,/journal_account_removing/);
  sql(`update bordone_private.journal_members set enabled=true where user_id='${owner}';`);
  fail(save('admin-accidentally-reenabled'),owner,/journal_account_removing/);
  // Reads remain owner-only, permitting an already-open local export while the
  // server removes files. No metadata delete is used by the actual service.
  assert.equal(sql("select count(*) from public.journal_visits where id='before-removal';",owner),'1');
  assert.equal(sql(`select count(*) from public.journal_visits where user_id='${owner}';`,b),'0');
});
test('completion requires absent Auth user AND absent photo objects; receipt survives cascade',()=>{
  const owner=removalOwner(),request=randomUUID(),image=photo(owner);sql(save('removal-cascade',0,randomUUID(),payload,[image]),owner);
  sql(removal(owner,request,'begin'),null,'service_role');
  sql(`delete from auth.users where id='${owner}';`); // Isolated Auth-shaped fixture only.
  assert.equal(JSON.parse(sql(removal(owner,request),null,'service_role')).status,'pending');
  assert.equal(sql(`select count(*) from public.journal_visits where user_id='${owner}';`),'0');
  assert.equal(sql(`select count(*) from public.journal_assets where user_id='${owner}';`),'0');
  sql(`delete from storage.objects where owner_id='${owner}';`); // Emulate successful Storage API removal.
  assert.equal(JSON.parse(sql(removal(owner,request),null,'service_role')).status,'complete');
  assert.equal(JSON.parse(sql(removal(owner,request),null,'service_role')).status,'complete');
  assert.equal(sql(removal(b,request),null,'service_role'),'');
});
test('removal and an in-flight save serialize on the same owner lock',async()=>{
  const owner=removalOwner(),request=randomUUID();
  const saving=asyncSql(`begin; ${save('in-flight')} select pg_sleep(0.2); commit;`,owner);
  const child=spawn(bin('psql'),['-X','-qAt','-v','ON_ERROR_STOP=1'],{env,stdio:['pipe','pipe','pipe']});
  let stderr='';child.stderr.on('data',d=>stderr+=d);child.stdout.resume();const done=new Promise(resolve=>child.on('close',code=>resolve({code,stderr})));
  child.stdin.end(`set role service_role; ${removal(owner,request,'begin')}`);
  const [saved,removed]=await Promise.all([saving.finished,done]);assert.equal(removed.code,0,removed.stderr);
  if(saved.code!==0)assert.match(saved.stderr,/journal_account_removing/);
  fail(save('after-race'),owner,/journal_account_removing/);
  assert.equal(JSON.parse(sql(removal(owner,request),null,'service_role')).status,'pending');
});
test('receipt maintenance expires only old completed requests, never unfinished removal',()=>{
  const old=removalOwner(),pending=removalOwner(),oldRequest=randomUUID(),pendingRequest=randomUUID();
  sql(removal(old,oldRequest,'begin'),null,'service_role');sql(removal(pending,pendingRequest,'begin'),null,'service_role');
  sql(`delete from auth.users where id='${old}'; update bordone_private.journal_removals set requested_at=now()-interval '9 days' where user_id in('${old}','${pending}'); update bordone_private.journal_removals set completed_at=now()-interval '8 days' where user_id='${old}';`);
  assert.equal(sql(removal(old,oldRequest),null,'service_role'),'');
  assert.equal(JSON.parse(sql(removal(pending,pendingRequest),null,'service_role')).status,'pending');
});

test('real SDK removal service completes against actual SQL coordination with labeled Auth/Storage fixtures',async()=>{
  const {removeAccount}=await import('../../server/account-removal.js');
  const owner=removalOwner(),other=removalOwner(),requestId=randomUUID(),image=photo(owner),foreign=photo(other);
  sql(save('service-removal',0,randomUUID(),payload,[image]),owner);
  const env={SUPABASE_URL:'https://sql-removal-fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_sql_fixture_only',SUPABASE_SECRET_KEY:'sb_secret_sql_fixture_only'};
  const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}});
  let loseFinal=true,protocolError;
  async function fetch(url,options={}){
    try{
      const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;
      if(path==='/auth/v1/user'||path===`/auth/v1/admin/users/${owner}`&&options.method==='GET')return sql(`select count(*) from auth.users where id='${owner}';`)==='1'?json({id:owner}):json({message:'fixture user absent',code:'user_not_found'},401);
      if(path==='/rest/v1/rpc/journal_account_removal'){
        assert.equal(body.p_owner,owner);assert.ok(['begin','status'].includes(body.p_action));assert.match(body.p_request_id,/^[0-9a-f-]{36}$/);
        const result=sql(removal(owner,body.p_request_id,body.p_action),null,'service_role');return json(result?JSON.parse(result):null);
      }
      if(path==='/storage/v1/object/list/journal-photos-v1'){
        assert.equal(body.prefix,owner);return json(JSON.parse(sql(`select coalesce(json_agg(json_build_object('id',id,'name',split_part(name,'/',2))),'[]') from storage.objects where bucket_id='journal-photos-v1' and owner_id='${owner}';`)));
      }
      if(path==='/storage/v1/object/journal-photos-v1'&&options.method==='DELETE'){
        for(const name of body.prefixes){assert.equal(name,`${owner}/${image}.jpg`);sql(`delete from storage.objects where bucket_id='journal-photos-v1' and name=${quote(name)};`);}return json([]);
      }
      if(path===`/auth/v1/admin/users/${owner}`&&options.method==='DELETE'){
        assert.equal(sql(`select count(*) from storage.objects where owner_id='${owner}';`),'0');sql(`delete from auth.users where id='${owner}';`);
        if(loseFinal){loseFinal=false;throw new TypeError('fixture lost Auth response');}return json({});
      }
      throw Error('Unexpected fixture path');
    }catch(e){if(e.code==='ERR_ASSERTION'||e.message==='Unexpected fixture path')protocolError=e;throw e;}
  }
  const run=action=>removeAccount({owner,requestId,action,confirmation:'DELETE'},'fixture-access-token-for-sql-test',{env,fetch});
  assert.equal((await run('start')).status,'pending');fail(save('server-write-after-freeze'),owner,/journal_account_removing/);
  await assert.rejects(()=>run('continue'),{status:503});if(protocolError)throw protocolError;
  assert.equal((await run('continue')).status,'complete');if(protocolError)throw protocolError;
  assert.equal(sql(`select count(*) from public.journal_visits where user_id='${owner}';`),'0');
  assert.equal(sql(`select count(*) from public.journal_assets where user_id='${owner}';`),'0');
  assert.equal(sql(`select count(*) from storage.objects where name='${other}/${foreign}.jpg';`),'1');
  assert.equal(sql(`select count(*) from auth.users where id='${other}';`),'1');
});
