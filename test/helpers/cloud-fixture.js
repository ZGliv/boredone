// Explicit HTTP fixtures for testing the real supabase-js wire format. This is
// NOT a Supabase server and provides no evidence of hosted Auth/RLS/Storage.
const randomUUID=()=>crypto.randomUUID();
const base64url=value=>btoa(value).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export const sessionFor=(owner,expires=Math.floor(Date.now()/1000)+3600)=>({user:{id:owner},access_token:`${base64url('{"alg":"test"}')}.${base64url(JSON.stringify({sub:owner,role:'authenticated',exp:expires}))}.fixture`});
export function cloudFixture(owner){
  const assets=new Map(),objects=new Map(),visits=new Map(),calls=[];
  const controls={loseUpload:false,loseSave:false,loseDelete:false,corruptDownload:false,arrayRpc:false};
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
  const fail=(message,code='22023',status=400)=>json({message,code},status);
  const rpcData=v=>json(controls.arrayRpc?[v]:v);
  async function fetch(url,options={}){
    const u=new URL(url),headers=new Headers(options.headers),method=options.method||'GET';
    const body=typeof options.body==='string'?JSON.parse(options.body):options.body;
    calls.push({url:u,method,headers,body,cache:options.cache,signal:options.signal});
    const rpc=u.pathname.split('/rpc/')[1];
    if(rpc){
      if(body.p_owner!==owner)return fail('journal_account_changed','42501',403);
      const a=assets.get(body.p_id);
      if(rpc==='prepare_journal_photo'){
        if(a){if(['deleted','deleting'].includes(a.state))return fail('journal_photo_retired');return rpcData(a);}
        const row={user_id:owner,id:body.p_id,sha256:body.p_sha256,mime_type:body.p_mime_type,byte_size:body.p_byte_size,state:'reserved',object_name:`${owner}/${body.p_id}.${{'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[body.p_mime_type]}`};assets.set(row.id,row);return rpcData(row);
      }
      if(rpc==='finish_journal_photo'){
        if(!a||['deleted','deleting'].includes(a.state))return fail('journal_photo_unavailable');
        if(!objects.has(a.object_name))return fail('journal_photo_upload_incomplete');a.state='ready';return rpcData(a);
      }
      if(rpc==='save_journal_visit'){
        const prior=visits.get(body.p_id);if(prior?.mutation_id===body.p_mutation_id)return rpcData(prior);
        if((prior?.revision||0)!==body.p_expected_revision)return fail('journal_conflict','40001',409);
        if(prior?.deleted&&!body.p_deleted)return fail('journal_visit_deleted');
        if(!body.p_deleted&&body.p_photo_ids.some(id=>!assets.has(id)||assets.get(id).state!=='ready'||!objects.has(assets.get(id).object_name)))return fail('journal_photos_not_ready');
        const row={user_id:owner,id:body.p_id,revision:(prior?.revision||0)+1,mutation_id:body.p_mutation_id,payload:body.p_payload,photo_ids:body.p_photo_ids,deleted:body.p_deleted,changed_at:new Date().toISOString()};visits.set(row.id,row);
        if(controls.loseSave){controls.loseSave=false;throw new TypeError('Failed to fetch');}return rpcData(row);
      }
      if(rpc==='begin_journal_photo_delete'){
        if(!a)return fail('journal_photo_unavailable');
        if([...visits.values()].some(v=>!v.deleted&&v.photo_ids.includes(a.id)))return fail('journal_photo_in_use');
        if(a.state!=='deleted')a.state='deleting';return rpcData(a);
      }
      if(rpc==='finish_journal_photo_delete'){
        if(!a)return fail('journal_photo_unavailable');if(objects.has(a.object_name))return fail('journal_photo_delete_incomplete');a.state='deleted';return rpcData(a);
      }
    }
    if(u.pathname==='/rest/v1/journal_visits'){
      let result=[...visits.values()].sort((a,b)=>a.id<b.id?-1:1);const filter=u.searchParams.get('id');
      if(filter?.startsWith('eq.'))result=result.filter(v=>v.id===filter.slice(3));
      if(filter?.startsWith('gt.'))result=result.filter(v=>v.id>filter.slice(3));
      if(u.searchParams.has('limit'))result=result.slice(0,Number(u.searchParams.get('limit')));
      return json(result);
    }
    if(u.pathname==='/rest/v1/journal_assets'){
      const ids=(u.searchParams.get('id')||'').slice(4,-1).split(',');return json([...assets.values()].filter(a=>ids.includes(a.id)));
    }
    if(u.pathname.startsWith('/storage/v1/object/journal-photos-v1/')&&method==='GET'){
      const path=decodeURIComponent(u.pathname.split('/journal-photos-v1/')[1]),bytes=objects.get(path);
      if(!bytes)return fail('Object not found','not_found',404);
      const output=bytes.slice();if(controls.corruptDownload)output[0]^=1;
      return new Response(output,{headers:{'content-type':'image/png'}});
    }
    if(u.pathname.startsWith('/storage/v1/object/journal-photos-v1/')&&method==='POST'){
      const path=decodeURIComponent(u.pathname.split('/journal-photos-v1/')[1]);
      if(objects.has(path))return json({message:'The resource already exists',statusCode:'409'},409);
      objects.set(path,new Uint8Array(body).slice());
      if(controls.loseUpload){controls.loseUpload=false;throw new TypeError('Failed to fetch');}
      return json({Key:`journal-photos-v1/${path}`,Id:randomUUID()});
    }
    if(u.pathname==='/storage/v1/object/journal-photos-v1'&&method==='DELETE'){
      for(const path of body.prefixes)objects.delete(path);
      if(controls.loseDelete){controls.loseDelete=false;throw new TypeError('Failed to fetch');}
      return json(body.prefixes.map(name=>({name})));
    }
    throw Error(`Unrecognized fixture request: ${method} ${u.pathname}`);
  }
  return {fetch,assets,objects,visits,calls,controls};
}
