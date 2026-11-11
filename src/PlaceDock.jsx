import React,{useLayoutEffect,useRef,useState} from 'react';
import {VenuePhoto} from './PlaceCard';
import {useOnline,venuePhoto} from './venuePhoto';
import {sheetDragAction} from './sheetGesture';
export default function PlaceDock({place:active,onDetails,onExpand,onSaveVisit,onPlan,ready,plans,onVisit,onDismiss,tonight,onTonight,directions}){
 const dock=useRef(null),gesture=useRef(null),suppressClick=useRef(false),online=useOnline();
 const [drag,setDrag]=useState(0);
 useLayoutEffect(()=>{
  const el=dock.current,world=el.closest('.world-screen');
  const update=()=>world.style.setProperty('--dock-height',`${el.offsetHeight}px`);
  const observer=new ResizeObserver(update);observer.observe(el);update();
  return()=>{observer.disconnect();world.style.removeProperty('--dock-height');};
 },[]);
 function begin(event){
  if(!matchMedia('(max-width:760px)').matches||event.button>0||event.target.closest('a'))return;
  gesture.current={x:event.clientX,y:event.clientY,time:performance.now()};suppressClick.current=false;
 }
 function move(event){if(!gesture.current)return;const dy=event.clientY-gesture.current.y,dx=event.clientX-gesture.current.x;if(Math.abs(dy)>8&&Math.abs(dy)>Math.abs(dx)){event.currentTarget.setPointerCapture(event.pointerId);setDrag(Math.max(-60,Math.min(220,dy)));}}
 function end(event){
  const start=gesture.current;if(!start)return;gesture.current=null;setDrag(0);
  const dy=event.clientY-start.y,dx=event.clientX-start.x;
  suppressClick.current=Math.max(Math.abs(dx),Math.abs(dy))>12;
  const action=sheetDragAction({dx,dy,elapsed:performance.now()-start.time});
  if(action==='dismiss')onDismiss();else if(action==='expand')onExpand(active);
 }
 const gestures={onPointerDown:begin,onPointerMove:move,onPointerUp:end,onPointerCancel:()=>{gesture.current=null;setDrag(0);},onClickCapture:event=>{if(suppressClick.current){event.preventDefault();event.stopPropagation();suppressClick.current=false;}}};
 const p=active,photo=venuePhoto(p,online),plan=plans.find(x=>x.place.id===p.id),saved=tonight.some(x=>x.id===p.id);
 return <section ref={dock} className={`place-dock ${drag?'dock-dragging':''}`} style={{'--dock-drag':`${drag}px`}} aria-label="Places on the map">
  <button className="dock-handle" aria-label="Expand place card" onClick={()=>onExpand(active)} {...gestures}><span/></button>
  <button className="dock-close" aria-label="Close place card" onClick={onDismiss}>×</button>
  <article className="dock-place dock-single" data-id={p.id} aria-label={p.name}>
    <div className="dock-swipe-area" {...gestures}><VenuePhoto key={photo?.url} photo={photo} fallback={p.photo} name={p.name} onOpen={()=>onDetails(p)}/></div>
    <div className="dock-copy">
     <div className="dock-title"><h2>{p.name}</h2>{onTonight&&<button className="tonight-save" aria-label={saved?'Remove from Tonight':'Save for tonight'} aria-pressed={saved} onClick={()=>onTonight(p)}><img src="/world/icons/bookmark-simple.svg" alt=""/><span>{saved?'Saved':'Tonight'}</span></button>}</div>
     <div className="dock-swipe-area" {...gestures}><p>{p.category.replaceAll('_',' ')}{p.distanceKm!=null?` · ${p.distanceKm} km away`:''}</p><span className="dock-reason">{p.recommendation?'Listed in Wikivoyage':p.cuisine?p.cuisine.replaceAll(';',' · ').replaceAll('_',' '):p.address||'Explore this place'}</span></div>
    </div>
    <div className="dock-actions"><button disabled={!ready} onClick={()=>plan?onVisit(plan):onPlan(p)}>{plan?'I went here':'Make a plan'}<img src="/world/icons/arrow-right.svg" alt=""/></button><button className="secondary" onClick={()=>onExpand(p)}>Details ↑</button></div>
    <button className="dock-directions" disabled={!ready} onClick={()=>onSaveVisit(p)}>Save a visit</button>
    {p.source!=='Sample' &&<a className="dock-directions" href={directions(p)} target="_blank" rel="noreferrer">Directions ↗</a>}
  </article>
 </section>;
}
