import test from 'node:test';
import assert from 'node:assert/strict';
import {pinPhotoUrl} from '../src/photoUrls.js';
test('pin thumbnails use documented CDN sizes without changing venue identity',()=>{
 const square='https://images.squarespace-cdn.com/content/v1/site/food.jpg?format=2500w';
 assert.equal(new URL(pinPhotoUrl(square)).searchParams.get('format'),'300w');
 const wix='https://static.wixstatic.com/media/id~mv2.jpg/v1/fill/w_1000,h_900/foo.jpg';
 assert.equal(new URL(pinPhotoUrl(wix)).pathname,'/media/id~mv2.jpg/v1/fill/w_160,h_160,q_80/file.webp');
 const bento=new URL(pinPhotoUrl('https://images.getbento.com/accounts/a/food.jpg?w=1800&h=1800&crop=focalpoint&fp-x=0.6'));
 assert.equal(bento.searchParams.get('w'),'160');assert.equal(bento.searchParams.get('h'),'160');assert.equal(bento.searchParams.get('fp-x'),'0.6');
 assert.equal(new URL(pinPhotoUrl('https://laprima.com/cdn/shop/files/coffee.jpg?v=1&width=480')).searchParams.get('width'),'160');
});
test('unknown, local and signed source URLs stay untouched',()=>{
 for(const url of ['/guide-photos/local.jpg','https://venue.example/food.jpg?width=2000','https://x.imgix.net/food.jpg?s=signature','https://cdn.shopify.com/file.jpg?X-Amz-Signature=secret','not a url'])assert.equal(pinPhotoUrl(url),url);
});

import {readFileSync,existsSync} from 'node:fs';
import {photoPreview,localPhoto,photoAtlasStyle} from '../src/photoUrls.js';
import {bundledArea,DEFAULT_AREA,CORRIDOR_AREA} from '../src/preloaded.js';
test('every current guide photo has an exact-source preview, existing card file and valid atlas cell',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../src/data/photo-previews.json',import.meta.url)));
 assert.ok(existsSync(new URL('../public'+manifest.atlas,import.meta.url)));
 for(const place of [...bundledArea(DEFAULT_AREA).places,...bundledArea(CORRIDOR_AREA,5000).places]){const source=place.websitePhoto||place.photo;if(!source)continue;
  const preview=photoPreview(source);assert.ok(preview,place.name);assert.ok(preview.index>=0&&preview.index<manifest.columns*manifest.rows);
  assert.ok(existsSync(new URL('../public'+preview.card,import.meta.url)));
  const local=localPhoto(source);assert.equal(local.sourceUrl,source.sourceUrl);assert.equal(local.originalUrl,source.url);assert.equal(localPhoto(local).url,local.url);assert.equal(photoPreview(local),preview);assert.ok(photoAtlasStyle(local).backgroundImage.includes(manifest.atlas));
 }
 const unknown={url:'https://another-venue.test/image.jpg'};assert.equal(localPhoto(unknown),unknown);assert.equal(photoPreview(unknown),undefined);
});
