import {editorialFreshness} from './recommendations';
import {venuePhoto,useOnline} from './venuePhoto';
import {sheetDragAction} from './sheetGesture';
import React, { useEffect, useRef, useState } from "react";
import { displayDate } from "./model";
import {VenuePhoto,EditorialCredit} from "./PlaceCard";
import { placeIcon } from "./exploration";

export default function PlaceInspector({ initialExpanded=false, savedTonight, onTonight, place, plan, memory, ready, onClose, onDismiss, onPrevious, onNext, position, onPlan, onSaveVisit, onVisit, onMemory, directions }) {
  const online=useOnline(),photo=venuePhoto(place,online);
  const heading = useRef(null), scroll = useRef(null), gesture = useRef(null), suppressClick = useRef(false);
  const [expanded,setExpanded] = useState(initialExpanded), [drag,setDrag] = useState(0);
  useEffect(()=>{if(scroll.current)scroll.current.scrollTop=0;setDrag(0);},[place.id]);
  function beginDrag(event){
    if(!window.matchMedia('(max-width:760px)').matches || event.button>0 || event.target.closest('a'))return;
    gesture.current={y:event.clientY,x:event.clientX,time:performance.now()};
  }
  function moveDrag(event){if(!gesture.current)return;const dy=event.clientY-gesture.current.y,dx=event.clientX-gesture.current.x;if(Math.abs(dy)>8&&Math.abs(dy)>Math.abs(dx)){event.currentTarget.setPointerCapture(event.pointerId);setDrag(Math.max(-90,dy));}}
  function endDrag(event){
    const start=gesture.current;if(!start)return;gesture.current=null;
    const dy=event.clientY-start.y,elapsed=Math.max(1,performance.now()-start.time);
    setDrag(0);suppressClick.current=Math.max(Math.abs(dy),Math.abs(event.clientX-start.x))>8;
    const action=sheetDragAction({dx:event.clientX-start.x,dy,elapsed,expanded});
    if(action==='dismiss')onDismiss();else if(action==='collapse')setExpanded(false);else if(action==='expand')setExpanded(true);
  }
  function cancelDrag(){gesture.current=null;setDrag(0);}
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [place.id]);
  const facts = [["Hours",place.hours],["Entry",place.fee],["Access",place.access]].filter(([,value])=>value);
  return <section className={`place-inspector ${photo ? "has-photo" : ""} ${expanded ? "sheet-expanded" : ""} ${drag ? "sheet-dragging" : ""}`} style={{"--sheet-drag":`${drag}px`}} aria-labelledby="place-title" onKeyDown={event=>{if(event.key==="Escape")onDismiss();}}>
    <div className="sheet-grip" onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag}>
      <button aria-label={expanded ? "Collapse place details" : "Expand place details"} aria-expanded={expanded} onClick={event=>{if(suppressClick.current){suppressClick.current=false;if(event.detail!==0)return;}setExpanded(value=>!value);}}><span/></button>
    </div>
    <div className="inspector-navigation">
      <button onClick={onClose} className="inspector-back">← Results</button>

      <button onClick={onDismiss} className="inspector-map">Map <span aria-hidden="true">×</span></button>
    </div>
    <div className="inspector-scroll" ref={scroll}>
      <div className="inspector-cover" onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag}>
        {photo ? <VenuePhoto key={photo.url} photo={photo} fallback={place.photo} name={place.name}/> : <div className="inspector-art"><span className={`landmark-sprite landmark-${placeIcon(place.category)}`} aria-hidden="true"/></div>}

      </div>
      <div className="inspector-body">
        <div className="inspector-eyebrow"><span>{(place.category || "Your place").replaceAll("_"," ")}</span>{place.distanceKm != null && <span>{place.distanceKm < .1 ? "Under 100 m" : `${place.distanceKm} km away`}</span>}</div>
        <h2 id="place-title" ref={heading} tabIndex={-1}>{place.name}</h2>
        {onTonight&&<button className="inspector-tonight" aria-pressed={savedTonight} onClick={onTonight}><img src="/world/icons/bookmark-simple.svg" alt=""/>{savedTonight?"Saved for tonight":"Save for tonight"}</button>}
        {place.address && <p className="inspector-address">{place.address}</p>}
        {plan && <p className="outing-status">On your list · {displayDate(plan.planDate)}</p>}
        <button className="inspector-tonight" disabled={!ready} onClick={onSaveVisit}>Save a visit</button>
        {memory && <button className="memory-revisit" onClick={onMemory}>Your visit · {displayDate(memory.visitDate)} ↗</button>}
        {place.recommendation?.text && (editorialFreshness(place.recommendation)==='dated'
          ? <div className="inspector-editorial"><p>{place.recommendation.text}</p><EditorialCredit recommendation={place.recommendation}/></div>
          : <details className="inspector-editorial quiet-details"><summary>{editorialFreshness(place.recommendation)==='old'?`Older guide note · ${place.recommendation.listingUpdated.slice(0,4)}`:'Guide note · date unknown'}</summary><p>{place.recommendation.text}</p><EditorialCredit recommendation={place.recommendation}/></details>)}
        {facts.length>0 && <dl className="inspector-facts">{facts.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
        <div className="inspector-links">{place.website && <a href={place.website} target="_blank" rel="noreferrer">Visit website <span>↗</span></a>}{!place.recommendation && place.sourceUrl && <a href={place.sourceUrl} target="_blank" rel="noreferrer">Place source <span>↗</span></a>}</div>
      </div>
    </div>
    <div className="inspector-actions">
      <button disabled={!ready} onClick={plan ? onVisit : onPlan}>{plan ? "I went here" : "Make a plan"}<span aria-hidden="true">↗</span></button>
      {place.source !== "Sample" && <a className="button secondary" href={directions} target="_blank" rel="noreferrer">Directions ↗</a>}
      {plan && <button className="text-button" disabled={!ready} onClick={onPlan}>Edit plan</button>}
    </div>
  </section>;
}
