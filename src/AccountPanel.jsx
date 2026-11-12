import React,{useEffect,useState} from 'react';
import {readLibrary} from './storage.js';
import AccountRemovalControls from './AccountRemovalControls.jsx';
import {displayDate} from './model.js';
import {outingLabel} from './saves.js';
export function syncLabel(account,sync){
  if(!account?.owner)return 'Saved on this device';
  if(account.removal)return 'Account removal in progress';
  if(sync?.conflicts?.length)return 'Changes need your review';
  if(sync?.pending)return `${sync.pending} ${sync.pending===1?'visit':'visits'} waiting to sync`;
  if(sync?.cleanup)return 'Photo removal waiting to sync';
  if(account.localOnly)return 'Using this device’s saved copy';
  if(account.error)return 'Sync needs attention';
  if(['receiving','sending','removing','pending'].includes(account.phase))return 'Syncing your journal…';
  if(account.lastSyncedAt&&account.phase==='idle')return 'Synced with your account';
  return 'Saved on this device';
}
export default function AccountPanel({account,library,onChanged,onExport}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[guestCount,setGuestCount]=useState(null),[copyOpen,setCopyOpen]=useState(false),[review,setReview]=useState(null);
  const store=account.store;
  useEffect(()=>{let active=true;if(account.owner)readLibrary().then(data=>{if(active)setGuestCount(data.outings.length);}).catch(()=>{if(active)setGuestCount(null);});return()=>{active=false;};},[account.owner]);
  async function act(action){setBusy(true);setError('');setNotice('');try{await action();}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function copy(){
    const original=await readLibrary(),current=await store.read();
    const result=await store.importLegacy(original.outings,current.revision);await onChanged();setCopyOpen(false);
    setNotice(`Copied ${result.imported.added} ${result.imported.added===1?'outing':'outings'}. Originals stay on this device.`);
  }
  async function resolve(id,choice){await store.resolveConflict(id,choice,review.revision);setReview(await store.conflicts());await onChanged();}
  return <section className="settings-card account-panel" aria-label="Account and backup">
    <h2>{account.owner?'Your account':'Take your memories with you'}</h2>
    {account.owner?<>
      <p className="account-email">{account.user?.email||'Signed in with Google'}</p>
      <p className="account-status" role="status">{syncLabel(account,library.sync)}</p>
      {account.error&&<p className={account.phase==='offline'?'account-offline-note':'notice error'}>{account.error}</p>}
      {account.removal?<AccountRemovalControls account={account} library={library} onExport={onExport} busy={busy} act={act}/>:<>
      {(account.localOnly||account.phase==='session')&&<button disabled={busy} onClick={()=>act(account.signIn)}>Sign in again with Google</button>}
      <div className="button-row"><button className="secondary" disabled={busy} onClick={()=>act(()=>account.sync())}>Sync now</button><button className="text-button" disabled={busy} onClick={()=>act(async()=>{if((library.sync?.pending||library.sync?.conflicts?.length||library.sync?.cleanup)&&!confirm('Some changes are only on this device. Sign in to this same account later to finish syncing them. Sign out now?'))return;await account.signOut();})}>Sign out</button></div>
      {!!library.sync?.conflicts?.length&&<button className="secondary" disabled={busy} onClick={()=>act(async()=>setReview(await store.conflicts()))}>Review conflicting changes</button>}
      {review?.items.map(item=><div className="account-conflict" key={item.id}>
        <h3>{item.local?outingLabel(item.local):item.cloud?outingLabel(item.cloud):'Deleted visit'}</h3>
        <p>{item.cloud?'This visit changed on another device.':'This visit was deleted on another device.'} {item.local?"Your local version is still here.":"Your local change removes this visit."}</p>
        {item.cloud&&<details><summary>See account version</summary><p>{displayDate(item.cloud.visitDate||item.cloud.planDate)}{item.cloud.with&&` · With ${item.cloud.with}`}</p><p>{item.cloud.notes}</p><div className="account-photo-strip">{item.cloud.photos.map((photo,i)=><img key={i} src={photo} alt={`Account version photo ${i+1}`}/>)}</div></details>}
        <div className="button-row">{item.local&&<button disabled={busy} onClick={()=>act(()=>resolve(item.id,'keep-both'))}>Keep my version as a copy</button>}<button className="secondary" disabled={busy} onClick={()=>act(async()=>{if(confirm('Replace this local version with the account version? Export your journal first to keep an extra copy.'))await resolve(item.id,'use-cloud');})}>{item.cloud?'Use account version':'Accept deletion'}</button></div>
      </div>)}
      {!!guestCount&&<details className="quiet-details" open={copyOpen} onToggle={e=>setCopyOpen(e.currentTarget.open)}><summary>Bring this device’s saves</summary><p>{guestCount} saved {guestCount===1?'outing':'outings'} can be copied into this account, including photos and notes. Originals stay on this device. Different versions are kept as separate copies.</p><button disabled={busy} onClick={()=>act(copy)}>{busy?'Copying…':'Copy device saves to account'}</button></details>}
      <p className="hint">Only completed visits and plans sync. Unfinished drafts stay on this device.</p>
      <AccountRemovalControls account={account} library={library} onExport={onExport} busy={busy} act={act}/>
      </>}
    </>:<><p>Sign in with Google to sync visits and photos between your devices. Your current saves stay here until you choose to copy them.</p><button disabled={busy||account.phase==='loading'} onClick={()=>act(account.signIn)}>{busy?'Opening Google…':'Continue with Google'}</button>{account.error&&<p className="notice error">{account.error}</p>}</>}
    {!account.owner&&!!account.unfinishedRemovals&&<div className="account-removal-progress"><p>A previous account removal is not yet confirmed on this device.</p><button className="secondary" disabled={busy} onClick={()=>act(account.checkRemovals)}>Check removal status</button></div>}
    {account.removalNotice&&<p role="status">{account.removalNotice}</p>}
    {error&&error!==account.error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </section>;
}
