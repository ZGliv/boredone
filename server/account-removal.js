import {createClient} from '@supabase/supabase-js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i;
const BUCKET='journal-photos-v1';
export class RemovalError extends Error {constructor(status,code){super(code);this.status=status;this.code=code;}}
export function removalInput(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['owner','requestId','action','confirmation'].includes(k))||typeof value.owner!=='string'||typeof value.requestId!=='string'||!UUID.test(value.owner)||!UUID.test(value.requestId)||!['start','continue','status'].includes(value.action)||value.confirmation!=='DELETE')throw new RemovalError(400,'invalid_request');
  return {...value,owner:value.owner.toLowerCase(),requestId:value.requestId.toLowerCase()};
}
function config(env){
  let url;try{url=new URL(env.SUPABASE_URL);}catch{throw new RemovalError(503,'not_configured');}
  if(url.protocol!=='https:'||url.pathname!=='/'||url.search||url.hash||url.username||url.password||!env.SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')||!env.SUPABASE_SECRET_KEY?.startsWith('sb_secret_'))throw new RemovalError(503,'not_configured');
  return {url:url.origin,key:env.SUPABASE_PUBLISHABLE_KEY,secret:env.SUPABASE_SECRET_KEY};
}
// Every call has fresh clients and a fixed expected owner. Never accept a
// project URL, secret, bucket or object path from the request body.
export async function removeAccount(value,token,{env=process.env,fetch:fetcher=globalThis.fetch,timeoutMs=25000}={}){
  const input=removalInput(value),{url,key,secret}=config(env);
  if(input.action!=='status'&&(typeof token!=='string'||token.length<20||token.length>20000))throw new RemovalError(401,'sign_in_required');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  const boundedFetch=(target,options={})=>fetcher(target,{...options,cache:'no-store',signal:controller.signal});
  const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:boundedFetch}};
  const userClient=createClient(url,key,options),admin=createClient(url,secret,options);
  const check=()=>{if(controller.signal.aborted)throw new RemovalError(503,'retry_removal');};
  async function receipt(action){
    check();const {data,error}=await admin.rpc('journal_account_removal',{p_owner:input.owner,p_request_id:input.requestId,p_action:action});
    if(error)throw new RemovalError(503,'retry_removal');
    const row=Array.isArray(data)?data[0]:data;
    if(row!==null&&(!row||!UUID.test(row.requestId)||!['pending','complete'].includes(row.status)))throw new RemovalError(503,'retry_removal');
    if(action==='status'&&row&&row.requestId!==input.requestId)throw new RemovalError(503,'retry_removal');
    return row;
  }
  try{
    // The random receipt is a read-only capability. It can confirm completion
    // after Auth/refresh credentials have disappeared, but cannot delete data.
    if(input.action==='status'){const result=await receipt('status');if(!result)throw new RemovalError(404,'receipt_not_found');return result;}
    const {data,error}=await userClient.auth.getUser(token);check();
    if(error&&![401,403,404].includes(error.status))throw new RemovalError(503,'retry_removal');
    if(error||!data.user){
      // A receipt may confirm an already completed request after Auth is gone.
      // It NEVER authorizes starting or continuing destructive work.
      if(input.action==='continue'){
        const done=await receipt('status');if(done?.status==='complete')return done;
      }
      throw new RemovalError(401,'sign_in_required');
    }
    if(data.user.id!==input.owner)throw new RemovalError(409,'account_changed');
    if(input.action==='start')return await receipt('begin');
    const job=await receipt('status');
    if(!job)throw new RemovalError(409,'start_required');
    if(job.status==='complete')return job;
    const bucket=admin.storage.from(BUCKET);let removed=0;
    // Always list from offset zero: deleting a batch shifts the following rows.
    // Bound each request; the durable receipt permits another foreground pass.
    for(let batch=0;batch<5;batch++){
      check();const {data:files,error:listError}=await bucket.list(input.owner,{limit:200,offset:0,sortBy:{column:'name',order:'asc'}});
      if(listError||!Array.isArray(files))throw new RemovalError(503,'retry_removal');
      if(!files.length){
        check();const {error:deleteError}=await admin.auth.admin.deleteUser(input.owner,false);
        if(deleteError)throw new RemovalError(503,'retry_removal');
        const done=await receipt('status');if(done?.status!=='complete')throw new RemovalError(503,'retry_removal');
        return done;
      }
      if(files.some(file=>!file.id||!FILE.test(file.name)))throw new RemovalError(503,'storage_review_required');
      check();const {error:removeError}=await bucket.remove(files.map(file=>`${input.owner}/${file.name}`));
      if(removeError)throw new RemovalError(503,'retry_removal');
      removed+=files.length;
    }
    return {...job,removed};
  }catch(e){if(e instanceof RemovalError)throw e;throw new RemovalError(503,'retry_removal');}
  finally{clearTimeout(timer);void userClient.auth.dispose();void admin.auth.dispose();}
}
export async function accountRemovalHandler(req,res){
  res.setHeader('Cache-Control','no-store, private');res.setHeader('Vary','Authorization');
  const send=(status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));};
  if(req.method!=='POST'){res.setHeader('Allow','POST');send(405,{error:'method_not_allowed'});return;}
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){send(415,{error:'json_required'});return;}
  try{
    let body=req.body;
    if(body===undefined){let raw='';for await(const part of req){raw+=part.toString();if(Buffer.byteLength(raw)>512)throw new RemovalError(413,'request_too_large');}try{body=JSON.parse(raw);}catch{throw new RemovalError(400,'invalid_request');}}
    else if(typeof body==='string'){if(Buffer.byteLength(body)>512)throw new RemovalError(413,'request_too_large');try{body=JSON.parse(body);}catch{throw new RemovalError(400,'invalid_request');}}
    if(Buffer.byteLength(JSON.stringify(body))>512)throw new RemovalError(413,'request_too_large');
    const header=req.headers.authorization||'';if(body?.action!=='status'&&!header.startsWith('Bearer '))throw new RemovalError(401,'sign_in_required');
    const result=await removeAccount(body,header.slice(7));send(result.status==='complete'?200:202,result);
  }catch(e){send(e instanceof RemovalError?e.status:503,{error:e instanceof RemovalError?e.code:'retry_removal'});}
}
