import {useEffect,useState} from 'react';
import {readTonight,toggleTonight,TONIGHT_KEY} from './tonight';
export default function useTonight(){
 const read=()=>{try{return readTonight(localStorage);}catch{return readTonight(null);}};
 const [state,setState]=useState(read),[error,setError]=useState('');
 useEffect(()=>{
  const refresh=()=>setState(read());
  const changed=event=>{if(event.key===TONIGHT_KEY||event.key===null)refresh();};
  const visible=()=>{if(document.visibilityState==='visible')refresh();};
  const timer=setTimeout(refresh,Math.max(1,state.expiresAt-Date.now()+20));
  window.addEventListener('storage',changed);document.addEventListener('visibilitychange',visible);
  return()=>{clearTimeout(timer);window.removeEventListener('storage',changed);document.removeEventListener('visibilitychange',visible);};
 },[state.expiresAt]);
 function toggle(place){try{setState(toggleTonight(localStorage,place));setError('');}catch(e){setError(e.message.includes('Tonight is full')?e.message:'Couldn’t save Tonight in this browser. Your plans are unchanged.');}}
 return {places:state.places,error,toggle};
}
