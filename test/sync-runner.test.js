import test from 'node:test';
import assert from 'node:assert/strict';
import {createJournalSync} from '../src/syncRunner.js';
import {CloudJournalError} from '../src/cloudJournal.js';

// Small port doubles isolate scheduling/reporting. Real IndexedDB + real SDK
// integration is exercised by output/playwright/sync-worker-*.js, with explicit
// HTTP fixtures. Neither test suite stands in for hosted Auth/Storage testing.
function ports(count=0){
  const jobs=Array.from({length:count},(_,id)=>({id:`job-${id}`,visitId:`visit-${id}`,photos:[],content:null}));
  const errors=new Set(),events=[],calls={list:0,save:0,cancel:0};
  const journal={owner:'test-owner',assertActive(){},
    async syncIndex(){return {records:[],pending:jobs.length,ready:jobs.filter(j=>!errors.has(j.id)).length,cleanup:0,cleanupIds:[],conflicts:[]};},
    async nextJob(excluded=[]){const eligible=jobs.filter(j=>!excluded.includes(j.id));return eligible.find(j=>!errors.has(j.id))||eligible[0];},
    async isCurrentJob(id){return jobs.some(j=>j.id===id);},
    async acknowledge(id){const index=jobs.findIndex(j=>j.id===id);if(index>=0)jobs.splice(index,1);errors.delete(id);},
    async markError(id){errors.add(id);},
    async receive(){throw Error('Unexpected receive');},
  };
  const cloud={owner:journal.owner,assertActive(){},cancel(){calls.cancel++;},
    async listVisits(){calls.list++;return [];},
    async getAssets(){return [];},
    async saveVisit(){calls.save++;return {};},
  };
  return {journal,cloud,jobs,errors,events,calls,worker:()=>createJournalSync({journal,cloud,onProgress:e=>events.push(e)})};
}

test('drains more than one batch and retains failed incoming-photo status and aggregate counts',async()=>{
  const p=ports(55);
  p.cloud.listVisits=async()=>{p.calls.list++;return [{id:'unavailable-remote',revision:1,photo_ids:['missing-photo']}];};
  const report=await p.worker().run();
  assert.equal(report.saved,55);assert.equal(p.calls.save,55);assert.equal(p.calls.list,1);
  assert.equal(report.status,'attention');assert.equal(report.errors[0].phase,'receive');
  assert.equal(report.errors[0].id,'unavailable-remote');assert.equal(p.events.at(-1).phase,'attention');
});

test('one failed outgoing photo does not block healthy jobs or cause unbounded retry',async()=>{
  const p=ports(55);
  p.cloud.saveVisit=async job=>{p.calls.save++;if(job.id==='job-0')throw new CloudJournalError('quota','Full');return {};};
  const report=await p.worker().run();
  assert.equal(report.saved,54);assert.equal(report.pending,1);assert.equal(report.status,'attention');
  assert.equal(p.calls.save,56);assert.equal(p.jobs[0].id,'job-0');
});

test('offline response leaves queued work and ends the pass',async()=>{
  const p=ports(5);p.cloud.saveVisit=async()=>{p.calls.save++;throw new CloudJournalError('offline','Offline');};
  const report=await p.worker().run();
  assert.equal(report.status,'offline');assert.equal(p.calls.save,1);assert.equal(p.jobs.length,5);
});

test('coalesces status-triggered runs without an endless idle loop',async()=>{
  const p=ports();let worker,callbacks=0;
  worker=createJournalSync({journal:p.journal,cloud:p.cloud,onProgress(){callbacks++;worker.run();}});
  const first=worker.run();assert.equal(first,worker.run());
  assert.equal((await first).status,'idle');assert.equal(p.calls.list,2);assert.equal(callbacks,4);
});

test('cancellation during an awaited response suppresses subsequent writes and progress',async()=>{
  const p=ports(1);let release,started;
  const began=new Promise(resolve=>started=resolve),waiting=new Promise(resolve=>release=resolve);
  p.cloud.listVisits=async()=>{started();await waiting;return [];};
  const worker=p.worker(),running=worker.run();await began;
  worker.stop();const progress=p.events.length;release();
  assert.equal((await running).status,'stopped');assert.equal(p.calls.save,0);assert.equal(p.jobs.length,1);
  assert.equal(p.events.length,progress);assert.equal(p.calls.cancel,1);
  assert.equal((await worker.run()).status,'stopped');
});

test('refuses a journal and transport bound to different owners',()=>{
  const p=ports();p.cloud.owner='other-owner';assert.throws(()=>p.worker(),/does not match/);
});
