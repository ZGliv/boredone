import test from 'node:test';import assert from 'node:assert/strict';
import {matchVenuePhoto,collectCommonsPhotos} from '../server/commons-photos.js';
const venue={name:'Harbor Kitchen',lat:40.44,lng:-80};
const photo=(title='Harbor Kitchen Pittsburgh.jpg',description='Harbor Kitchen in Pittsburgh')=>({pageid:1,title:'File:'+title,imageinfo:[{thumburl:'https://upload.wikimedia.org/harbor.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Harbor.jpg',extmetadata:{Artist:{value:'Photographer'},LicenseShortName:{value:'CC BY-SA 4.0'},ImageDescription:{value:description}}}]});
test('city photo matches require actual venue identity and city evidence',()=>{
 assert.ok(matchVenuePhoto(venue,[photo()],[venue],'Pittsburgh'));
 assert.equal(matchVenuePhoto(venue,[photo('Harbor Kitchen London.jpg','London')],[venue],'Pittsburgh'),null);
 assert.equal(matchVenuePhoto(venue,[photo('Skyline Pittsburgh.jpg','Near Harbor Kitchen in Pittsburgh')],[venue],'Pittsburgh'),null);
 assert.equal(matchVenuePhoto({name:'Images',lat:40.44,lng:-80},[photo('Images Pittsburgh.jpg')],[],'Pittsburgh'),null);
});
test('chain branches require matching coordinates; distant images and closed venues are rejected',()=>{
 const branches=[venue,{...venue,lat:40.46}];assert.equal(matchVenuePhoto(venue,[photo()],branches,'Pittsburgh'),null);
 const near={...photo(),coordinates:[{lat:40.4401,lon:-80}]};assert.ok(matchVenuePhoto(venue,[near],branches,'Pittsburgh'));
 near.coordinates[0].lat=40.46;assert.equal(matchVenuePhoto(venue,[near],branches,'Pittsburgh'),null);
 assert.equal(matchVenuePhoto(venue,[photo('Harbor Kitchen Pittsburgh.jpg','Former Harbor Kitchen, closed in Pittsburgh')],[venue],'Pittsburgh'),null);
});
test('city index remains bounded and keeps successful evidence when a source query fails',async()=>{
 let count=0;const result=await collectCommonsPhotos('Pittsburgh',{maxPages:100,fetcher:async url=>{count++;assert.equal(new URL(url).hostname,'commons.wikimedia.org');if(count===2)return Response.json({error:{info:'Search busy'}});return Response.json({query:{pages:{1:photo()}}});}});
 assert.equal(count,8);assert.equal(result.pages.length,1);assert.equal(result.failures.length,1);
});
test('known chains cannot borrow a city photo from a different unlisted branch',()=>{
 const place={...venue,name:"Eat'n Park"};assert.equal(matchVenuePhoto(place,[photo('Eatn Park in Pittsburgh.jpg','Eatn Park, Pittsburgh')],[place],'Pittsburgh'),null);
});
