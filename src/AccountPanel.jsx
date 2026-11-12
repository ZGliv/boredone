import React,{useEffect,useState} from 'react';
import {readLibrary} from './storage.js';
import AccountRemovalControls from './AccountRemovalControls.jsx';
import {displayDate} from './model.js';
import {outingLabel} from './saves.js';
import {Button,useConfirm} from './ui';
export function syncLabel(account,sync){
  if(!account?.owner)return 'Saved on this device';
  if(account.removal)return 'Account removal in progress';
  if(sync?.conflicts?.length)return 'Changes need your review';
  if(sync?.pending)return `${sync.pending} ${sync.pending===1?'change':'changes'} waiting to sync`;
  if(sync?.cleanup)return 'Photo removal waiting to sync';
  if(account.localOnly)return 'Using this device’s copy';
  if(account.error)return 'Sync needs attention';
  if(['receiving','sending','removing','pending'].includes(account.phase))return 'Syncing';
  if(account.lastSyncedAt&&account.phase==='idle')return 'Synced';
  return 'Saved on this device';
}
// Changes only this device holds: sign-out leaves them here, unsynced.
const unsynced=sync=>(sync?.pending||0)+(sync?.conflicts?.length||0)+(sync?.cleanup?1:0);
// Account (Settings). One gold action at a time: sign in when signed out;
// signed in, every action is quiet.
export default function AccountPanel({account,library,onChanged,onExport}){
  const confirm=useConfirm();
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[guestCount,setGuestCount]=useState(null),[copyOpen,setCopyOpen]=useState(false),[review,setReview]=useState(null);
  const store=account.store;
  useEffect(()=>{let active=true;if(account.owner)readLibrary().then(data=>{if(active)setGuestCount(data.outings.length);}).catch(()=>{if(active)setGuestCount(null);});return()=>{active=false;};},[account.owner]);
  async function act(action){setBusy(true);setError('');setNotice('');try{await action();}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function copy(){
    const original=await readLibrary(),current=await store.read();
    const result=await store.importLegacy(original.outings,current.revision);await onChanged();setCopyOpen(false);
    setNotice(`Copied ${result.imported.added}`);
  }
  async function signOut(){
    const left=unsynced(library.sync);
    if(left&&!(await confirm(`Sign out? ${left} ${left===1?'change':'changes'} not synced`,{action:'Sign out'})))return;
    await account.signOut();
  }
  async function resolve(id,choice){await store.resolveConflict(id,choice,review.revision);setReview(await store.conflicts());await onChanged();}
  async function useCloud(id){if(await confirm('Use account version?',{action:'Use it'}))await resolve(id,'use-cloud');}
  return <section className="settings-card account-panel" aria-label="Account">
    <h2 className="t-caps">Account</h2>
    {account.owner?<>
      <p className="account-email">{account.user?.email||'Google account'}</p>
      <p className="account-status" role="status">{syncLabel(account,library.sync)}</p>
      {account.error&&<p className={account.phase==='offline'?'account-offline-note':'notice error'}>{account.error}</p>}
      {account.removal?<AccountRemovalControls account={account} library={library} onExport={onExport} busy={busy} act={act}/>:<>
      {(account.localOnly||account.phase==='session')&&<Button variant="quiet" disabled={busy} onClick={()=>act(account.signIn)}>Sign in again</Button>}
      <div className="button-row">
        <Button variant="quiet" disabled={busy} onClick={()=>act(()=>account.sync())}>Sync now</Button>
        <Button variant="text" disabled={busy} onClick={()=>act(signOut)}>Sign out</Button>
      </div>
      {!!library.sync?.conflicts?.length&&!review&&<Button variant="quiet" disabled={busy} onClick={()=>act(async()=>setReview(await store.conflicts()))}>Review changes</Button>}
      {review?.items.map(item=><div className="account-conflict" key={item.id}>
        <h3>{item.local?outingLabel(item.local):item.cloud?outingLabel(item.cloud):'Deleted'}</h3>
        <p>{item.cloud?'Changed on another device':'Deleted on another device'}</p>
        {item.cloud&&<details><summary>Account version</summary><p>{displayDate(item.cloud.visitDate||item.cloud.planDate)}{item.cloud.with&&` · With ${item.cloud.with}`}</p><p>{item.cloud.notes}</p><div className="account-photo-strip">{item.cloud.photos.map((photo,i)=><img key={i} src={photo} alt={`Account version photo ${i+1}`}/>)}</div></details>}
        <div className="button-row">
          {item.local&&<Button variant="quiet" disabled={busy} onClick={()=>act(()=>resolve(item.id,'keep-both'))}>Keep both</Button>}
          <Button variant="quiet" disabled={busy} onClick={()=>act(()=>useCloud(item.id))}>{item.cloud?'Use account version':'Accept deletion'}</Button>
        </div>
      </div>)}
      {!!guestCount&&<details className="quiet-details" open={copyOpen} onToggle={e=>setCopyOpen(e.currentTarget.open)}><summary>Copy this device’s journal</summary><div className="button-row"><span className="account-count t-tab">{guestCount} on this device</span><Button variant="quiet" disabled={busy} onClick={()=>act(copy)}>{busy?'Copying':'Copy to account'}</Button></div></details>}
      <AccountRemovalControls account={account} library={library} onExport={onExport} busy={busy} act={act}/>
      </>}
    </>:<><Button variant="primary" disabled={busy||account.phase==='loading'} onClick={()=>act(account.signIn)}>{busy?'Opening Google':'Sign in with Google'}</Button>{account.error&&<p className="notice error">{account.error}</p>}</>}
    {!account.owner&&!!account.unfinishedRemovals&&<div className="account-removal-progress"><p>Removal unconfirmed</p><Button variant="quiet" disabled={busy} onClick={()=>act(account.checkRemovals)}>Check again</Button></div>}
    {account.removalNotice&&<p role="status">{account.removalNotice}</p>}
    {error&&error!==account.error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </section>;
}
