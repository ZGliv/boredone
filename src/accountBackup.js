import {MAX_RECORDS,VERSION,backupPayload,checkCapacity} from './model.js';
import {canonicalAccountOuting} from './syncQueue.js';
import {photoBytes} from './syncPhotos.js';
export const ACCOUNT_BACKUP_BYTES=80*1024*1024;
export function accountBackup(library){
  const photos=[],ids=new Map();
  const outings=library.outings.map(outing=>({...canonicalAccountOuting(outing,true),photos:outing.photos.map(photo=>{
    if(!ids.has(photo)){ids.set(photo,photos.length);photos.push(photo);}return ids.get(photo);
  })}));
  const value={...backupPayload({outings}),version:2,photos};
  if(new Blob([JSON.stringify(value)]).size>ACCOUNT_BACKUP_BYTES)throw Error('This account backup exceeds 80 MB. Your journal has not changed.');
  return value;
}
export function readAccountBackup(value){
  if(value?.app!=='boredone'||![VERSION,2].includes(value.version)||!Array.isArray(value.outings)||value.outings.length>MAX_RECORDS)throw Error('Choose a Boredone journal backup with up to 500 plans and memories plus 1,000 saves.');
  const photos=value.version===2?value.photos:[];
  if(!Array.isArray(photos)||photos.length>12000)throw Error('Invalid backup photos.');
  const ids=new Set(),unique=new Set();
  const outings=value.outings.map(o=>{
    if(!Array.isArray(o?.photos))throw Error('Invalid backup photo references.');
    const item=canonicalAccountOuting({...o,photos:value.version===2?o.photos.map(id=>{
      if(!Number.isInteger(id)||id<0||id>=photos.length)throw Error('A backup photo is missing.');return photos[id];
    }):o.photos},true);
    if(ids.has(item.id))throw Error('The backup contains duplicate outing IDs.');ids.add(item.id);
    item.photos.forEach(p=>unique.add(p));return item;
  });
  checkCapacity(outings);
  let bytes=0;for(const p of unique){bytes+=photoBytes(p).bytes.byteLength;if(bytes>50*1024*1024)throw Error('These photos exceed the 50 MB account photo limit.');}
  return outings;
}
