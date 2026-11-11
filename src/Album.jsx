import React,{useState} from 'react';
import {Modal} from './Editor';
export default function Album({photos,name}) {
 const [index,setIndex]=useState(null);
 if(!photos.length)return <p className="hint">No photos yet. Edit this memory to add some.</p>;
 return <><div className="visit-album">{photos.map((src,i)=><button key={i} aria-label={`Open photo ${i+1} of ${photos.length}`} onClick={()=>setIndex(i)}><img src={src} loading="lazy" alt={`Photo ${i+1} from ${name}`}/></button>)}</div>{index!==null&&<Modal wide title={`${index+1} / ${photos.length}`} onClose={()=>setIndex(null)}><div className="album-viewer" onKeyDown={e=>{if(e.key==='ArrowRight')setIndex(i=>Math.min(photos.length-1,i+1));if(e.key==='ArrowLeft')setIndex(i=>Math.max(0,i-1));}}><img src={photos[index]} alt={`Photo ${index+1} from ${name}`}/><div className="album-controls"><button className="secondary" disabled={index===0} onClick={()=>setIndex(index-1)}>Previous photo</button><button className="secondary" disabled={index===photos.length-1} onClick={()=>setIndex(index+1)}>Next photo</button></div></div></Modal>}</>;
}
