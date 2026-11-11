import test from 'node:test';import assert from 'node:assert/strict';
import{publicAddress,previewUrl,extractWebsitePreview,robotsAllows}from'../server/site-previews.js';
const venue={name:'Harbor Kitchen'},url='https://harborkitchen.example/';
test('website previews use actual published image metadata, never the page URL for an empty tag',()=>{
 const html='<title>Harbor Kitchen Pittsburgh</title><meta property="og:image" content="/food.jpg">';const p=extractWebsitePreview(html,url,venue);assert.equal(p.photo.url,url+'food.jpg');assert.equal(p.photo.offline,false);assert.equal(p.photo.license,null);
 assert.equal(previewUrl('',url),'');assert.equal(extractWebsitePreview('<title>Harbor Kitchen</title>',url,venue).photo,undefined);
});
test('website photo preview rejects logos, unrelated pages and explicit opt-outs',()=>{
 for(const html of ['<title>Harbor Kitchen</title><meta property="og:image" content="/logo.png">','<title>Unrelated Casino</title><meta property="og:image" content="/food.jpg">','<title>Harbor Kitchen</title><meta name="robots" content="noimageindex"><meta property="og:image" content="/food.jpg">'])assert.equal(extractWebsitePreview(html,url,venue).photo,undefined);
});
test('public page fetching rejects local targets and unsafe URL forms',()=>{
 for(const raw of ['http://example.com','https://127.0.0.1','https://localhost','https://home.local','https://user:pass@example.com','https://example.com:8443','javascript:alert(1)'])assert.equal(previewUrl(raw),'');
 for(const ip of ['127.0.0.1','10.1.2.3','172.16.0.4','192.168.1.2','169.254.169.254','::1','fc00::1','::ffff:127.0.0.1'])assert.equal(publicAddress(ip),false);
 assert.equal(publicAddress('8.8.8.8'),true);
});
test('robots honors specific groups, allow precedence and path exclusions',()=>{
 assert.equal(robotsAllows('User-agent: *\nDisallow: /','/'),false);
 assert.equal(robotsAllows('User-agent: *\nDisallow: /\nAllow: /menu','/menu'),true);
 assert.equal(robotsAllows('User-agent: OtherBot\nDisallow: /','/'),true);
 assert.equal(robotsAllows('User-agent: *\nAllow: /\nUser-agent: BordonePreview\nDisallow: /','/'),false);
});
test('page photos can come from structured image data or prominent images without accepting logos',()=>{
 const html='<title>Harbor Kitchen</title><script type="application/ld+json">{"@type":"Restaurant","image":"/dinner.jpg","logo":"/logo.png"}</script><img src="/logo.png" alt="logo"><img src="/interior.jpg" width="800" height="600">';
 const result=extractWebsitePreview(html,url,venue);assert.equal(result.photo.url,url+'dinner.jpg');assert.ok(result.candidates.includes(url+'interior.jpg'));assert.ok(!result.candidates.includes(url+'logo.png'));
});


test('gallery audit reads picture sources and HTML-encoded backgrounds without accepting logos',async()=>{
 const {galleryPhotoCandidates}=await import('../server/site-previews.js');
 const html='<picture><source srcset="/food-small.webp 300w, /food-large.webp 1200w"></picture><div style="background-image:url(&quot;/interior.jpg&quot;)"></div><img src="/brand-logo.png">';
 assert.deepEqual(galleryPhotoCandidates(html,'https://venue.example/'),['https://venue.example/interior.jpg','https://venue.example/food-large.webp']);
 assert.deepEqual(galleryPhotoCandidates('<meta name="robots" content="noimageindex"><img src="/food.jpg">','https://venue.example/'),[]);
 assert.deepEqual(galleryPhotoCandidates('<source srcset="http://private/food.jpg 800w">','https://venue.example/'),[]);
});

 test('gallery discovery keeps fonts from crowding out real encoded photos',async()=>{
 const {galleryPhotoCandidates}=await import('../server/site-previews.js');
 const fonts=Array.from({length:40},(_,i)=>`<div style="background:url(/gfonts/font${i}.woff2)"></div>`).join('');
 assert.deepEqual(galleryPhotoCandidates(fonts+'<div style="background:url(&amp;quot;/dining.jpg&amp;quot;)"></div>','https://venue.example/'),['https://venue.example/dining.jpg']);
 });

test('gallery audit discovers escaped Square storefront banners without publishing them',async()=>{
 const {galleryPhotoCandidates}=await import('../server/site-previews.js');
 const html=String.raw`<script>{"bannerImage":{"id":"cover","type":"cover","image":{"name":"cupcakes.jpg","source":"\/uploads\/b\/bakery\/cupcakes.jpg"}}}</script>`;
 assert.deepEqual(galleryPhotoCandidates(html,'https://venue.example/'),['https://venue.example/uploads/b/bakery/cupcakes.jpg']);
 assert.deepEqual(galleryPhotoCandidates('<meta name="robots" content="noimageindex">'+html,'https://venue.example/'),[]);
 const background=String.raw`<script>{"background":{"type":"image","image":{"source":"\/uploads\/b\/bakery\/pastries.png"}}}</script>`;
 assert.deepEqual(galleryPhotoCandidates(background,'https://venue.example/'),['https://venue.example/uploads/b/bakery/pastries.png']);
 assert.deepEqual(galleryPhotoCandidates('<img src="https://www.facebook.com/tr?id=1" alt="tracker">','https://venue.example/'),[]);
});
