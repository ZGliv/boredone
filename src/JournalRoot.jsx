import React,{useEffect,useState} from 'react';
import {flushSync} from 'react-dom';
// No auth SDK is downloaded or started when no free project is configured.
const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export default function JournalRoot({App,guestStore}){
  const [state,setState]=useState(null);
  useEffect(()=>{
    if(!url||!key)return;
    let active=true,controller;
    import('./journalSession.js').then(({createJournalSession})=>{
      if(!active)return;
      controller=createJournalSession({url,publishableKey:key,onChange:next=>{
        if(!active)return;
        // Replacing the keyed App unmounts editors/albums before another account
        // can interact with them. The controller revokes old storage first.
        flushSync(()=>setState({...next,signIn:()=>controller.signIn(),signOut:()=>controller.signOut(),sync:()=>controller.sync(),beginRemoval:value=>controller.beginRemoval(value),resumeRemoval:()=>controller.resumeRemoval(),checkRemovals:()=>controller.checkRemovals()}));
      }});
      return controller.start();
    }).catch(()=>{if(active)setState({key:'guest',phase:'failed',error:'Account offline. Using this device.'});});
    return()=>{active=false;controller?.close();};
  },[]);
  if(url&&key&&!state)return <main className="account-loading" role="status" aria-label="Loading"/>;
  return <App key={state?.key||'guest'} store={state?.store||guestStore} account={state?.signIn?state:null} accountError={state?.phase==='failed'?state.error:''}/>;
}
