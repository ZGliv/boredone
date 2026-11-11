import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDraft} from '../src/drafts.js';
import {makeOuting} from '../src/model.js';
const outing=makeOuting({id:'manual-one',name:'Draft fixture',source:'You'});
const draft=()=>({version:1,id:'draft-one',isNew:true,originalStamp:outing.updatedAt,savedAt:new Date().toISOString(),outing:{...outing,place:{...outing.place,name:''},status:'visited',visitDate:'',with:'Alex',photos:['data:image/jpeg;base64,/9j/']}});
test('incomplete visits preserve blank required fields and prepared photos without becoming saved visits',()=>{
 const original=draft(),restored=validateDraft(original);
 assert.equal(restored.outing.place.name,'');assert.equal(restored.outing.visitDate,'');assert.deepEqual(restored.outing.photos,original.outing.photos);assert.equal(restored.outing.with,'Alex');
});
test('malformed draft content is rejected rather than applied to a journal',()=>{
 assert.throws(()=>validateDraft({...draft(),id:'../current'}));
 assert.throws(()=>validateDraft({...draft(),outing:{...outing,photos:['https://not-a-private-photo']}}));
});
