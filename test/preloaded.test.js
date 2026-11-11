import test from 'node:test';
import assert from 'node:assert/strict';
import { preloadedDiscovery, bundledArea, DEFAULT_AREA } from '../src/preloaded.js';
test('a first visit starts with a genuine dated place guide without requesting location or discovery', () => {
 const {area,result}=preloadedDiscovery(null);
 assert.equal(area.name,'Pittsburgh'); assert.ok(result.places.length>120 && result.places.length<=800);
 assert.ok(result.sourceUpdatedAt); assert.equal(result.stale,true);
 assert.equal(result.bundled,true); assert.ok(result.attribution);
 assert.ok(result.places.every(p=>(/^(ofm-|wv-|verified-)/.test(p.id)) && Number.isFinite(p.lat) && p.sourceUrl));
 assert.equal(new Set(result.places.map(p=>p.id)).size,result.places.length);
});
test('a returning visitor keeps their saved area and the bundled guide never masquerades as another city', () => {
 const saved={area:{name:'London'},result:{places:[{id:'saved'}]}};
 assert.equal(preloadedDiscovery(saved),saved);
 assert.ok(bundledArea(DEFAULT_AREA)); assert.equal(bundledArea({lat:51.51,lng:-.13}),null);
 assert.equal(bundledArea(DEFAULT_AREA,1500),null);
});
test('refresh enrichment keeps the expanded city guide and bundled photos',async()=>{
 const {enrichBundledArea}=await import('../src/preloaded.js');const initial=preloadedDiscovery(null).result;
 const fresh={...initial,places:initial.places.slice(0,1).map(p=>({...p,photo:null}))};const merged=enrichBundledArea(DEFAULT_AREA,fresh);
 assert.ok(merged.places.length>500);assert.ok(merged.places.some(p=>p.photo?.url.startsWith('/guide-photos/')));
 assert.equal(enrichBundledArea({lat:51.51,lng:-.13},fresh),fresh);
});
test('bundled website previews keep source attribution and are available for offline display',async()=>{
 const {venuePhoto}=await import('../src/venuePhoto.js');const places=preloadedDiscovery(null).result.places;
 assert.ok(places.filter(p=>p.websitePhoto).length>=100);
 for(const place of places.filter(p=>p.websitePhoto)){assert.equal(place.websitePhoto.kind,'website-preview');assert.equal(place.websitePhoto.offline,false);assert.ok(place.websitePhoto.sourceUrl.startsWith('https://'));assert.ok(venuePhoto(place,false).url.startsWith('/photo-previews/'));assert.equal(venuePhoto(place,false).sourceUrl,place.websitePhoto.sourceUrl);assert.equal(venuePhoto(place,false).originalUrl,place.websitePhoto.url);}
 assert.equal(places.filter(p=>venuePhoto(p,false)).length,places.filter(p=>p.websitePhoto||p.photo).length);
 assert.equal(venuePhoto({websitePhoto:{url:'https://unbundled.test/a.jpg'}},false),undefined);
});
test('the 15317 corridor is preloaded, keeps its area on restore, and bundles its reviewed photos', async()=>{
 const {CORRIDOR_AREA,bundledArea,preloadedDiscovery}=await import('../src/preloaded.js');
 const {photoPreview}=await import('../src/photoUrls.js');
 const result=bundledArea(CORRIDOR_AREA,5000);assert.equal(result.corridor,true);assert.ok(result.places.length>300 && result.places.length<=800);
 assert.ok(result.places.some(p=>p.name==='Recon Brewing'));
 assert.ok(result.places.some(p=>p.name==="Linda's Hometown Bakery" && photoPreview(p.websitePhoto)));
 assert.ok(result.places.every(p=>Number.isFinite(p.distanceKm)));assert.equal(preloadedDiscovery({area:CORRIDOR_AREA,result:{...result,bundleRevision:'old'}}).result.bundleRevision,result.bundleRevision);
});
test('the bundled guide represents Max’s once while keeping its distinct comedy venue',()=>{
 const places=bundledArea(DEFAULT_AREA,5000).places;
 assert.equal(places.filter(p=>p.name==="Max's Allegheny Tavern").length,1);
 assert.ok(places.some(p=>p.id==='verified-steel-city-cellar' && p.category==='comedy_club'));
});
