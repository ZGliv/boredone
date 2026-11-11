import React,{useState} from 'react';
import {Modal} from './Editor.jsx';
export default function AccountRemovalControls({account,library,onExport,busy,act}){
  const [open,setOpen]=useState(false),[confirmation,setConfirmation]=useState('');
  const working=busy||account.removalBusyOwner===account.owner;
  if(account.removal)return <div className="account-removal-progress">
    <p role="status">{working?'Removing your account’s photos. Keep this page open.':'Removal is unfinished. Your device copy is available to export; editing and sync are paused.'}</p>
    <div className="button-row"><button className="secondary" disabled={working} onClick={onExport}>Export before removal</button><button disabled={working} onClick={()=>act(account.resumeRemoval)}>{working?'Removing…':'Continue removal'}</button></div>
    <button className="text-button" disabled={working} onClick={()=>act(account.signIn)}>Sign in again with Google</button>
    <button className="text-button" disabled={working} onClick={()=>act(account.signOut)}>Sign out</button>
  </div>;
  return <>
    <details className="quiet-details account-removal-options"><summary>Remove account</summary><p>Permanently remove your cloud memories and this account’s copy on this device.</p><button className="text-button danger-text" disabled={working} onClick={()=>{setConfirmation('');setOpen(true);}}>Review account removal</button></details>
    {open&&<Modal title="Remove your account?" onClose={()=>!working&&setOpen(false)}>
      <div className="account-removal-confirm">
        <p>This removes <strong>{account.user?.email||'this Google account'}</strong> from Bordone, including its cloud visits and photos. This account’s saved copy and unfinished drafts on this device will also be deleted.</p>
        <p>{library.outings.length} saved {library.outings.length===1?'outing':'outings'} on this device. Export anything you want to keep first; unfinished drafts are not included in exports.</p>
        <button className="secondary" disabled={working} onClick={onExport}>Export before removal</button>
        <p className="hint">Guest saves and other accounts stay. Exported files and copies on other devices are separate and are not erased by this action.</p>
        <label>Type DELETE to confirm<input value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off" spellCheck="false" disabled={working}/></label>
        <div className="dialog-actions"><button className="secondary" disabled={working} onClick={()=>setOpen(false)}>Keep my account</button><button className="danger-button" disabled={working||confirmation!=='DELETE'} onClick={()=>act(()=>account.beginRemoval(confirmation))}>{working?'Starting removal…':'Remove my account'}</button></div>
      </div>
    </Modal>}
  </>;
}
