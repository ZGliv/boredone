import React,{useState} from 'react';
import {Modal} from './Editor.jsx';
import {Button} from './ui';
// "1 done · 4 saved" for what removal deletes from this device.
function tally(outings){
  return [['visited','done'],['saved','saved'],['planned','planned']]
    .map(([status,word])=>[outings.filter(o=>o.status===status).length,word])
    .filter(([n])=>n).map(([n,word])=>`${n} ${word}`).join(' · ');
}
export default function AccountRemovalControls({account,library,onExport,busy,act}){
  const [open,setOpen]=useState(false),[confirmation,setConfirmation]=useState('');
  const working=busy||account.removalBusyOwner===account.owner;
  if(account.removal)return <div className="account-removal-progress">
    <p role="status">{working?'Removing photos':'Removal unfinished'}</p>
    <div className="button-row"><Button variant="quiet" disabled={working} onClick={onExport}>Export</Button><Button variant="primary" disabled={working} onClick={()=>act(account.resumeRemoval)}>{working?'Removing':'Continue removal'}</Button></div>
    <div className="button-row"><Button variant="text" disabled={working} onClick={()=>act(account.signIn)}>Sign in again</Button><Button variant="text" disabled={working} onClick={()=>act(account.signOut)}>Sign out</Button></div>
  </div>;
  const here=tally(library.outings);
  return <>
    <details className="quiet-details account-removal-options"><summary>Remove account</summary><Button variant="quiet" className="btn-danger" disabled={working} onClick={()=>{setConfirmation('');setOpen(true);}}>Remove account</Button></details>
    {open&&<Modal title={`Remove ${account.user?.email||'this account'}?`} onClose={()=>!working&&setOpen(false)}>
      <div className="account-removal-confirm">
        <div className="button-row">{here&&<span className="account-count t-tab">{here} on this device</span>}<Button variant="quiet" disabled={working} onClick={onExport}>Export</Button></div>
        <label>Type DELETE<input value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off" spellCheck="false" disabled={working}/></label>
        <div className="dialog-actions"><Button variant="quiet" disabled={working} onClick={()=>setOpen(false)}>Keep</Button><Button variant="quiet" className="btn-danger" disabled={working||confirmation!=='DELETE'} onClick={()=>act(()=>account.beginRemoval(confirmation))}>{working?'Removing':'Remove'}</Button></div>
      </div>
    </Modal>}
  </>;
}
