import {editorialFreshness} from './recommendations';
import {photoPreview,photoAtlasStyle} from './photoUrls';
import {venuePhoto,useOnline} from './venuePhoto';
import React,{useState} from 'react';
import {placeIcon} from './exploration';
export function VenuePhoto({photo:primary,fallback,name,onOpen}){
 const [failed,setFailed]=useState([]);
 const photo=[primary,fallback].find(item=>item&&!failed.includes(item.url)) || (photoPreview(primary)?primary:null);
 if(!photo)return null;
 const isPreview=failed.includes(photo.url)&&!!photoPreview(photo);
 const picture = <img style={isPreview?photoAtlasStyle(photo):undefined} src={isPreview?'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/%3E':photo.url} alt={name} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>{if(!isPreview)setFailed(urls=>[...urls,photo.url]);}}/>;
 return <figure className="venue-photo">{onOpen ? <button className="venue-photo-open" aria-label={`Explore ${name}`} onClick={onOpen}>{picture}</button> : picture}<figcaption><a href={photo.sourceUrl} target="_blank" rel="noreferrer">{photo.kind==='website-preview'?(photo.sourceLabel|| (photo.historicalLabel?`Historic photo · ${photo.historicalLabel} · venue website ↗`:photo.scope==='brand'?'Brand photo · website ↗':'From the venue website ↗')):photo.author}</a>{photo.license && <> · <a href={photo.licenseUrl} target="_blank" rel="noreferrer">{photo.license}</a> · cropped</>}</figcaption></figure>;
}
export function EditorialCredit({recommendation}){return recommendation&&<span className="editorial-credit"><a href={recommendation.sourceUrl} target="_blank" rel="noreferrer">Wikivoyage guide</a> · <a href={recommendation.license} target="_blank" rel="noreferrer">CC BY-SA 4.0</a>{recommendation.listingUpdated?` · listing updated ${recommendation.listingUpdated}`:' · listing date unknown'}</span>;}
export default function PlaceCard({item,onSelect,planned,visited}){
 const p=item.place,online=useOnline(),photo=venuePhoto(p,online);
 return <article className={`place-card ${photo?'with-photo':''}`}>
  <VenuePhoto key={photo?.url} photo={photo} fallback={p.photo} name={p.name} onOpen={()=>onSelect(p)}/>
  <button data-place-id={p.id} className="place-card-open" onClick={()=>onSelect(p)}><span className="place-card-type">{p.category.replaceAll('_',' ')}{p.distanceKm!=null?` · ${p.distanceKm<.1?'under 100 m':p.distanceKm+' km'}`:''}</span><strong>{p.name}</strong>{p.recommendation?.text&&editorialFreshness(p.recommendation)==='dated'?<span className="place-card-description">{p.recommendation.text}</span>:null}{(planned||visited)&&<span className="card-reason">{planned?'In your plans':'Visited before'}</span>}</button>
  <EditorialCredit recommendation={p.recommendation}/>
 </article>;
}
