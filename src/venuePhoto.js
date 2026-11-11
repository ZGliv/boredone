import {localPhoto,photoPreview} from './photoUrls.js';
import{useEffect,useState}from'react';
export function venuePhoto(place,online=true){const photo=(online||photoPreview(place?.websitePhoto)?place?.websitePhoto:null)||place?.photo;return localPhoto(photo);}
export function useOnline(){const [online,setOnline]=useState(()=>globalThis.navigator?.onLine!==false);useEffect(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);update();return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);return online;}
