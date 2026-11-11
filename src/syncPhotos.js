import {validateAsset,sameContent} from './syncQueue.js';
export function photoBytes(dataUrl){
  if(typeof dataUrl!=='string'||dataUrl.length>1400000)throw Error('Invalid account photo.');
  const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(dataUrl);
  if(!match)throw Error('Invalid account photo.');
  let decoded;try{decoded=atob(match[2]);}catch{throw Error('Invalid account photo.');}
  if(!decoded.length||decoded.length>1050000)throw Error('Invalid account photo size.');
  return {mimeType:match[1],bytes:Uint8Array.from(decoded,c=>c.charCodeAt(0))};
}
async function sha256(bytes){
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  return [...hash].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function describePhoto(dataUrl,id){
  const {mimeType,bytes}=photoBytes(dataUrl);
  return {id,sha256:await sha256(bytes),mimeType,byteSize:bytes.byteLength};
}
export async function verifyPhotoBytes(bytes,asset){
  const safe=validateAsset(asset);
  if(!(bytes instanceof Uint8Array)||bytes.byteLength!==safe.byteSize||await sha256(bytes)!==safe.sha256)throw Error('A photo failed its integrity check. Existing memories are unchanged.');
  return safe;
}
export async function verifiedPhotoData(bytes,asset){
  const safe=await verifyPhotoBytes(bytes,asset);let binary='';
  for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  const dataUrl=`data:${safe.mimeType};base64,${btoa(binary)}`;
  photoBytes(dataUrl);
  return {...safe,dataUrl};
}
export async function verifyPhotoData(file){
  const safe=validateAsset(file),actual=await describePhoto(file.dataUrl,safe.id);
  if(!sameContent(actual,safe))throw Error('A photo failed its integrity check. Existing memories are unchanged.');
  return {...safe,dataUrl:file.dataUrl};
}
