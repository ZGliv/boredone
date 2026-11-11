import {accountId} from './syncQueue.js';

// A navigation hint for this browser's existing cache, never authentication.
// No tokens are copied here. Recovery also requires the SDK's still-stored
// credential to identify the same owner. Sign-out replaces the identity with
// a no-identity barrier until an explicit new sign-in clears the old credential.
function identity(session){
  try{
    const owner=accountId(session?.user?.id);
    if(typeof session.access_token!=='string'||session.access_token.length>20000||typeof session.refresh_token!=='string'||!session.refresh_token||session.refresh_token.length>8192)return null;
    const parts=session.access_token.split('.');if(parts.length!==3)return null;
    const encoded=parts[1].replace(/-/g,'+').replace(/_/g,'/');
    const claims=JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length/4)*4,'=')));
    if(claims.sub!==owner||claims.role!=='authenticated'||!Number.isFinite(claims.exp))return null;
    return {owner,email:typeof session.user.email==='string'?session.user.email.slice(0,320):''};
  }catch{return null;}
}
export function createLocalAccountHint(projectUrl,providedStorage){
  const host=new URL(projectUrl).hostname,authKey=`boredone-auth-${host}`,hintKey=`boredone-local-account:${host}`;
  const storage=()=>providedStorage===undefined?globalThis.localStorage:providedStorage;
  function remember(session){try{const id=identity(session);if(id&&!isSignedOut())storage()?.setItem(hintKey,JSON.stringify({version:1,...id}));}catch{/* Optional cache recovery must not block a save. */}}
  function forget(){try{storage()?.setItem(hintKey,JSON.stringify({version:1,signedOut:true}));}catch{}}
  function isSignedOut(){try{return JSON.parse(storage()?.getItem(hintKey)||'null')?.signedOut===true;}catch{return false;}}
  function hasCredential(){try{return !!storage()?.getItem(authKey);}catch{return true;}}
  function allowSignIn(){
    if(hasCredential())throw Error('The previous sign-in is still closing. Try again in a moment. Your saved photos are unchanged.');
    try{storage()?.removeItem(hintKey);}catch{throw Error('This browser could not prepare sign-in. Your saved photos are unchanged.');}
  }
  function read(){
    try{
      const raw=storage()?.getItem(authKey),hintRaw=storage()?.getItem(hintKey);
      if(!raw||raw.length>100000||!hintRaw||hintRaw.length>1000)return null;
      const session=JSON.parse(raw),hint=JSON.parse(hintRaw),id=identity(session);
      if(!id||hint.signedOut||hint.version!==1||hint.owner!==id.owner)return null;
      return {session,owner:id.owner,email:id.email};
    }catch{return null;}
  }
  return {authKey,hintKey,remember,forget,read,isSignedOut,hasCredential,allowSignIn};
}
