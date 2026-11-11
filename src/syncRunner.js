import {CloudJournalError} from './cloudJournal.js';
import {validateAsset,sameContent} from './syncQueue.js';
const errorKind=error=>error.kind||(/space|50 MB|limit/i.test(error.message||'')?'quota':'server');
const stopKind=kind=>kind==='offline'||kind==='session';

// One foreground runner per authenticated account. The UI schedules runs on
// sign-in, local saves, focus/online and bounded retries; this module has no timer.
export function createJournalSync({journal,cloud,onProgress=()=>{}}){
  if(journal.owner!==cloud.owner)throw Error('The sync account does not match the local journal.');
  let stopped=false,running,requested=false;
  function active(){if(stopped)throw new CloudJournalError('session','Sync stopped.','stopped');journal.assertActive();cloud.assertActive();}
  function emit(value){if(stopped)return;try{onProgress(value);}catch{/* Presentation cannot interrupt a committed save. */}}
  async function ingest(row,report){
    active();
    const index=await journal.syncIndex();active();
    const known=index.records.find(r=>r.id===row.id);
    if(known&&row.revision<=Math.max(known.revision,known.conflictRevision))return;
    const ids=[...new Set(row.photo_ids)],files=[];
    const assets=await cloud.getAssets(ids);active();
    if(assets.length!==ids.length||assets.some(a=>a.state!=='ready'))throw new CloudJournalError('upload','A saved visit is waiting for an available cloud photo.','journal_photos_not_ready');
    for(const asset of assets){
      const cached=await journal.cachedPhoto(asset.id);active();
      if(cached&&!sameContent(validateAsset(cached),validateAsset(asset)))throw new CloudJournalError('integrity','The cloud photo identity changed. The local copy was preserved.');
      if(cached?.verified)continue;
      files.push(await cloud.downloadPhoto(asset));active();report.downloaded++;
    }
    await journal.receive(row,files);active();report.received++;
  }
  async function pull(report){
    emit({phase:'receiving'});const rows=await cloud.listVisits();active();
    for(const row of rows){
      try{await ingest(row,report);}catch(e){if(stopKind(errorKind(e)))throw e;report.errors.push({phase:'receive',kind:errorKind(e),id:row.id,message:e.message});}
    }
  }
  async function recover(job,error,report,retirementAttempts){
    if(!['conflict','retired'].includes(error.kind)&&error.code!=='journal_photos_not_ready')return false;
    const current=await cloud.getVisit(job.visitId);active();
    if(current&&current.revision>job.expectedRevision){await ingest(current,report);return true;}
    if(error.kind==='conflict')return false;
    if((current?.revision||0)!==job.expectedRevision)return false;
    const assets=await cloud.getAssets(job.content?.photoIds||[]);active();
    const retired=assets.filter(a=>['deleting','deleted'].includes(a.state));
    const attempts=retirementAttempts.get(job.visitId)||0;
    if(!retired.length||attempts>=2)return false;
    retirementAttempts.set(job.visitId,attempts+1);
    // Confirmed-retired assets cannot satisfy the old server mutation. Generate
    // new IDs atomically, retaining all local edits/photos and the expected revision.
    return await journal.replaceRetiredPhotos(job.id,{visitRevision:current?.revision||0,assets:retired});
  }
  async function pass(shouldPull=true,receiveErrors=[]){
    active();
    const report={owner:journal.owner,saved:0,received:0,downloaded:0,cleaned:0,errors:shouldPull?[]:[...receiveErrors],status:'idle',more:false};
    const excluded=[],retirementAttempts=new Map();
    try{
      if(shouldPull)await pull(report);
      for(let count=0;count<50;count++){
        active();const job=await journal.nextJob(excluded);active();if(!job)break;
        emit({phase:'sending',saved:report.saved,pendingId:job.visitId});
        try{
          for(const file of job.photos){
            active();if(!await journal.isCurrentJob(job.id))break;
            const cached=await journal.cachedPhoto(file.id);active();
            if(cached?.verified)continue;
            const verified=await cloud.ensurePhoto(file);active();report.downloaded++;
            await journal.cacheVerifiedPhoto(verified);active();
          }
          if(!await journal.isCurrentJob(job.id))continue;
          active();const response=await cloud.saveVisit(job);active();
          await journal.acknowledge(job.id,response);active();report.saved++;
        }catch(initial){
          if(stopped)throw initial;
          let error=initial;
          try{if(await recover(job,error,report,retirementAttempts))continue;}catch(e){error=e;}
          const kind=errorKind(error);
          await journal.markError(job.id,['offline','session','quota','upload'].includes(kind)?kind:'server');active();
          report.errors.push({phase:'send',kind,id:job.visitId,message:error.message});excluded.push(job.id);
          if(stopKind(kind)){report.status=kind;break;}
        }
      }
      if(!stopKind(report.status)){
        const index=await journal.syncIndex();active();
        for(const id of index.cleanupIds.slice(0,50)){
          // Another tab may have attached this photo while the list was read.
          if(!(await journal.syncIndex()).cleanupIds.includes(id))continue;
          emit({phase:'removing'});
          try{
            const result=await cloud.deletePhoto(id);active();
            if(result.deleted||result.inUse){await journal.finishCleanup(id);active();report.cleaned++;}
          }catch(e){
            const kind=errorKind(e);report.errors.push({phase:'remove',kind,id,message:e.message});
            if(stopKind(kind)){report.status=kind;break;}
          }
        }
      }
      const index=await journal.syncIndex();active();
      report.pending=index.pending;report.conflicts=index.conflicts.length;report.cleanup=index.cleanup;
      if(!stopKind(report.status))report.status=report.errors.length||report.conflicts?'attention':report.pending||report.cleanup?'pending':'idle';
      report.more=!stopKind(report.status)&&(index.ready>0||(!report.errors.length&&index.cleanup>0));emit({phase:report.status,pending:report.pending,conflicts:report.conflicts,cleanup:report.cleanup});
      return report;
    }catch(e){
      if(stopped)return {...report,status:'stopped',more:false};
      const kind=errorKind(e);report.status=stopKind(kind)?kind:'attention';report.errors.push({phase:'sync',kind,message:e.message});
      emit({phase:report.status});return report;
    }
  }
  function run(){
    if(stopped)return Promise.resolve({status:'stopped',more:false});
    if(running){requested=true;return running;}
    running=Promise.resolve().then(async()=>{
      let result,first=true,followups=0,receiveErrors=[];
      const totals={saved:0,received:0,downloaded:0,cleaned:0};
      do{
        const refresh=first||requested;requested=false;first=false;
        result=await pass(refresh,receiveErrors);
        receiveErrors=result.errors.filter(error=>error.phase==='receive');
        for(const key of Object.keys(totals))totals[key]+=result[key];
        // Coalesce UI notifications without letting a status callback create an
        // endless idle poll. Further local work is visible through ready/more.
      }while(!stopped&&(result.more||(requested&&followups++<1&&['idle','pending'].includes(result.status))));
      return {...result,...totals};
    }).finally(()=>{running=undefined;});
    return running;
  }
  function stop(){stopped=true;requested=false;cloud.cancel();}
  return {run,stop};
}
