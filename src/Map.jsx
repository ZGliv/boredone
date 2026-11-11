import React, { useEffect, useRef, useState } from "react";
import { Map as LibreMap, Marker, ScaleControl, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { pinStatus, placeIcon } from "./exploration";
import { pinPhotoUrl, photoAtlas, photoPreview, photoAtlasStyle } from "./photoUrls";
import {venuePhoto} from "./venuePhoto";
import {markerOffsets} from "./markerOffsets";
import { selectionPan } from "./selectionCamera";
import { worldStyle } from "./worldStyle";
import "maplibre-gl/dist/maplibre-gl.css";
setWorkerUrl(workerUrl);

export default function Map({ theme="light", photoPins=false, onControlsReady, center, places, fitPlaces = places, selected, selectionSurface="dock", onSelect, onClearSelection, layer = "discover", outings = [], onUnavailable }) {
  const [atlasState,setAtlasState]=useState('loading');
  useEffect(()=>{let active=true;const img=new Image();img.onload=async()=>{try{await img.decode();}catch{}if(active)setAtlasState('ready');};img.onerror=()=>{if(active)setAtlasState('error');};img.src=photoAtlas;return()=>{active=false;};},[]);
  const root = useRef(null), map = useRef(null), markers = useRef(new globalThis.Map()), onSelectRef = useRef(onSelect), unavailableRef = useRef(onUnavailable);
  const clearRef=useRef(onClearSelection);clearRef.current=onClearSelection;
  const controlsRef=useRef(onControlsReady); controlsRef.current=onControlsReady;
  const fittedView = useRef("");
  const returnCamera = useRef(null);
  const overviewCamera = useRef(null);
  const themeRef=useRef(theme);themeRef.current=theme;
  const selectedRef = useRef(null), surfaceRef = useRef(null), selectionLayout = useRef(null), manualCamera = useRef(false);
  const [viewport, setViewport] = useState([0, 0]);
  const [mapState, setMapState] = useState("loading"), [retry, setRetry] = useState(0);
  onSelectRef.current = onSelect;
  unavailableRef.current = onUnavailable;
  useEffect(() => {
    let instance, timer, hasTile = false;
    setMapState("loading");
    try {
      if (!navigator.onLine) { setMapState("error"); unavailableRef.current?.(); return; }
      instance = new LibreMap({ container: root.current, style: worldStyle(themeRef.current), center: [center.lng, center.lat], zoom: 13.5, minZoom: 2, maxZoom: 18, attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false, cooperativeGestures: false, fadeDuration: 0 });
      map.current = instance;
      instance.scrollZoom.enable();
      // Only real input invalidates the pre-selection camera.
      const markManual = () => { returnCamera.current = null; manualCamera.current = true; };
      const userMoved = event => { if (event.originalEvent) markManual(); };
      instance.on("movestart", userMoved);
      instance.on("zoomstart", userMoved);
      instance.on("dragstart", userMoved);
      const canvas = instance.getCanvasContainer();
      const wheelInput = markManual;
      const dragInput = event => { if (event.buttons || event.touches) markManual(); };
      canvas.addEventListener('wheel', wheelInput, {passive:true});
      canvas.addEventListener('pointermove', dragInput, {passive:true});
      canvas.addEventListener('touchmove', dragInput, {passive:true});
      instance.scrollZoom.setWheelZoomRate(1/700);
      instance.scrollZoom.setZoomRate(1/140);
      instance.on("click",()=>clearRef.current?.());
      controlsRef.current?.({zoomIn:()=>instance.zoomIn(),zoomOut:()=>instance.zoomOut()});
      instance.addControl(new ScaleControl({ maxWidth: 80, unit: "metric" }), "bottom-left");
      // MapLibre also emits load/idle after a source failure. Require an actual
      // successful tile event before declaring the geographic map available.
      instance.on("sourcedata", (event) => {
        if (event.sourceId === "world" && event.tile && event.tile.state === "loaded") {
          hasTile = true;
          clearTimeout(timer);
          setMapState("ready");
        }
      });
      instance.on("error", (event) => {
        // Incidental glyph/tile errors must not replace an already usable map.
        if (event.sourceId === "world" && !hasTile) setMapState("loading");
      });
      timer = setTimeout(() => {
        if (!hasTile) { setMapState("error"); unavailableRef.current?.(); }
      }, 18000);
      const observer = new ResizeObserver(() => { instance.resize(); setViewport([root.current.clientWidth, root.current.clientHeight]); });
      observer.observe(root.current);
      return () => { controlsRef.current?.(null); clearTimeout(timer); observer.disconnect(); markers.current.forEach(entry=>entry.marker.remove()); markers.current.clear(); instance.remove(); map.current = null; };
    } catch {
      setMapState("error");
      unavailableRef.current?.();
      return () => { clearTimeout(timer); instance?.remove(); map.current = null; };
    }
  }, [retry]);
  useEffect(()=>{
    const instance=map.current;if(!instance)return;
    const apply=()=>{for(const layer of worldStyle(theme).layers)if(instance.getLayer(layer.id))for(const [key,value] of Object.entries(layer.paint||{}))instance.setPaintProperty(layer.id,key,value);};
    if(instance.getLayer("paper"))apply();else instance.once('load',apply);
    return()=>instance.off('load',apply);
  },[theme,retry]);
  useEffect(() => {
    if (!map.current) return;
    // Journal saves and status changes can replace the array without changing
    // geography. Preserve the user's camera unless the actual collection changes.
    const viewKey = JSON.stringify([center.lat, center.lng, layer, retry, fitPlaces.map(p => [p.id, p.lat, p.lng]).sort((a,b)=>a[0].localeCompare(b[0]))]);
    if (fittedView.current === viewKey) return;
    fittedView.current = viewKey;
    returnCamera.current = null;
    selectedRef.current = null; surfaceRef.current = null; selectionLayout.current = null; manualCamera.current = false;
    const coordinates = fitPlaces.filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng)).map((place) => [place.lng, place.lat]);
    const desktop = root.current.clientWidth > 760;
    if (coordinates.length) {
      const bounds = coordinates.reduce((box, point) => [[Math.min(box[0][0], point[0]), Math.min(box[0][1], point[1])], [Math.max(box[1][0], point[0]), Math.max(box[1][1], point[1])]], [coordinates[0], coordinates[0]]);
      map.current.fitBounds(bounds, { padding: { top: desktop ? 100 : 110, bottom: 65, left: 50, right: desktop ? 90 : 40 }, maxZoom: 15, duration: 0 });
    } else map.current.jumpTo({ center: [center.lng, center.lat], zoom: 13.5 });
    overviewCamera.current={center:map.current.getCenter().toArray(),zoom:map.current.getZoom(),bearing:0,pitch:0};
  }, [center.lat, center.lng, fitPlaces, layer, retry, viewport[0], viewport[1]]);
  useEffect(() => {
    if (!map.current) return;
    const instance = map.current;
    // MapLibre moves existing markers itself. Do not recreate their DOM or
    // restart image decoding on zoom, pan, resize, selection or journal saves.
    const eligible=places.filter(place=>Number.isFinite(place.lat)&&Number.isFinite(place.lng));
    const ids=new Set(eligible.map(place=>place.id));
    const offsets=markerOffsets(eligible);
    for(const [id,entry] of markers.current){if(!ids.has(id)){entry.image=null;entry.marker.remove();markers.current.delete(id);}}
    for(const [index,place] of eligible.entries()){
      let entry=markers.current.get(place.id);
      if(!entry){
        const button=document.createElement('button');button.className='world-marker venue-pin';button.dataset.placeId=place.id;
        const sprite=document.createElement('span');sprite.setAttribute('aria-hidden','true');
        const label=document.createElement('span');label.className='landmark-label';
        button.append(sprite,label);
        entry={button,sprite,label,place,image:null,photoKey:null,lat:place.lat,lng:place.lng};
        button.addEventListener('click',event=>{event.stopPropagation();onSelectRef.current(entry.place);});
        entry.marker=new Marker({element:button,anchor:'center'}).setLngLat([place.lng,place.lat]).addTo(instance);
        markers.current.set(place.id,entry);
      }
      entry.place=place;
      const offset=offsets.get(place.id);
      if(!entry.offset || entry.offset[0]!==offset[0] || entry.offset[1]!==offset[1]){entry.marker.setOffset(offset);entry.offset=offset;}
      const status=layer==='discover'?pinStatus(place.id,outings):layer;
      if(entry.status!==status){if(entry.status)entry.button.classList.remove(entry.status);entry.button.classList.add(status);entry.status=status;}
      const isSelected=place.id===selected;
      entry.button.classList.toggle('selected',isSelected);
      entry.button.setAttribute('aria-pressed',String(isSelected));
      entry.button.setAttribute('aria-label',`${place.name}, ${status}`);
      entry.sprite.className=`landmark-sprite landmark-${placeIcon(place.category)}`;
      if(entry.label.textContent!==place.name)entry.label.textContent=place.name;
      if(entry.lat!==place.lat||entry.lng!==place.lng){entry.marker.setLngLat([place.lng,place.lat]);entry.lat=place.lat;entry.lng=place.lng;}
      const photo=photoPins?venuePhoto(place,navigator.onLine):null;
      const preview=photoPreview(photo);
      if(preview&&atlasState!=='error'){
        const key=photoAtlas+':'+preview.index;
        if(entry.photoKey!==key){
          entry.image?.remove();entry.image=null;entry.atlas?.remove();
          const tile=document.createElement('span');tile.className='pin-photo-tile';tile.setAttribute('aria-hidden','true');
          Object.assign(tile.style,photoAtlasStyle(photo));entry.button.insertBefore(tile,entry.label);entry.atlas=tile;entry.photoKey=key;
        }
        entry.button.classList.add('photo-pin');entry.atlas.hidden=atlasState!=='ready';
        if(atlasState==='ready')entry.sprite.remove();else if(!entry.sprite.isConnected)entry.button.prepend(entry.sprite);
        continue;
      }
      entry.atlas?.remove();entry.atlas=null;
      // A connection change must not erase an already decoded photo.
      if(!navigator.onLine&&entry.image?.complete&&entry.image.naturalWidth>0)continue;
      const urls=photo?[pinPhotoUrl(photo.url),photo.url,place.photo?.url].filter((url,i,all)=>url&&all.indexOf(url)===i):[];
      const photoKey=urls.join('|');
      if(entry.photoKey===photoKey){if(isSelected&&entry.image)entry.image.fetchPriority='high';continue;}
      entry.photoKey=photoKey;
      entry.image?.remove();entry.image=null;
      if(!entry.sprite.isConnected)entry.button.prepend(entry.sprite);
      entry.button.classList.toggle('photo-pin',!!photo);
      if(!photo)continue;
      const img=document.createElement('img');entry.image=img;
      img.alt='';img.loading='eager';img.decoding='async';img.referrerPolicy='no-referrer';img.hidden=true;
      img.fetchPriority=isSelected||index<12?'high':'auto';
      let attempt=0;
      img.onload=async()=>{
        try{await img.decode();}catch{}
        if(entry.image!==img||!img.isConnected)return;
        entry.sprite.remove();img.hidden=false;
      };
      img.onerror=()=>{
        if(entry.image!==img)return;
        if(++attempt<urls.length){img.src=urls[attempt];return;}
        img.remove();entry.image=null;entry.button.classList.remove('photo-pin');
      };
      entry.button.insertBefore(img,entry.label);img.src=urls[0];
    }
  }, [places, selected, outings, layer, retry, photoPins, atlasState]);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 320;
    const place = places.find(candidate => candidate.id === selected);
    if (place && Number.isFinite(place.lat) && Number.isFinite(place.lng)) {
      const newFocus = selectedRef.current !== selected || surfaceRef.current !== selectionSurface;
      if (newFocus) { instance.stop(); manualCamera.current = false; selectionLayout.current = null; }
      selectedRef.current = selected; surfaceRef.current = selectionSurface;
      const sheet = root.current.closest('.world-screen').querySelector(selectionSurface === 'details' ? '.place-inspector' : '.place-dock');
      let timer;
      function reveal() {
        if (manualCamera.current) return;
        const bounds = root.current.getBoundingClientRect(), sheetBounds = sheet?.getBoundingClientRect();
        const layout = JSON.stringify([selected, selectionSurface, bounds.width, bounds.height, sheetBounds?.top, sheetBounds?.left, sheetBounds?.right, sheetBounds?.bottom]);
        if (selectionLayout.current === layout) return;
        selectionLayout.current = layout;
        const pan = selectionPan(instance.project([place.lng, place.lat]), bounds, sheetBounds, markers.current.get(selected)?.offset);
        if (pan && (Math.abs(pan[0]) > 1 || Math.abs(pan[1]) > 1)) {
          if (!returnCamera.current) returnCamera.current = {center: instance.getCenter().toArray(), zoom: instance.getZoom(), bearing: instance.getBearing(), pitch: instance.getPitch()};
          instance.panBy(pan, {duration});
        }
      }
      reveal();
      // Wait for height transitions to settle. Transform-only thumb dragging
      // doesn't trigger this observer, so the map won't chase the user's hand.
      const observer = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(reveal, 100); });
      if (sheet) observer.observe(sheet);
      return () => { clearTimeout(timer); observer.disconnect(); };
    } else if (!selected && selectedRef.current) {
      selectedRef.current = null; surfaceRef.current = null; selectionLayout.current = null;
      instance.stop();
      if (returnCamera.current) instance.easeTo({...returnCamera.current, duration});
      returnCamera.current = null;
    }
  }, [selected, selectionSurface, retry, viewport[0], viewport[1], center.lat, center.lng]);

  function resetView(){
    if(!map.current||!overviewCamera.current)return;
    returnCamera.current=null;selectedRef.current=null;surfaceRef.current=null;selectionLayout.current=null;manualCamera.current=false;
    clearRef.current?.();
    map.current.flyTo({...overviewCamera.current,padding:0,offset:[0,0],duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:400,curve:1.2,easing:t=>t*t*(3-2*t)});
  }
  return <><button className="map-reset" aria-label="Reset map view" title="Show all places" onClick={resetView}><img src="/world/icons/corners-out.svg" alt=""/></button><div ref={root} className="map" role="region" aria-label={`Bordone world map. ${places.length} individual places; all places are also in the list.`} />{mapState === "loading" && <div className="world-map-notice" role="status">Unfolding your map…</div>}{mapState === "error" && <div className="world-map-notice" role="status"><strong>The map couldn’t unfold.</strong><span>You can still choose places from the list and keep your journal.</span><button className="text-button" onClick={() => setRetry((value) => value + 1)}>Try the map again</button></div>}</>;
}
