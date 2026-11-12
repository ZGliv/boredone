import test from 'node:test';import assert from 'node:assert/strict';
import {parseSaveUrl,splitShare,resolveDatePhrase,saveSource} from '../src/saveSource.js';
test('Instagram reels, posts, new-style reels and profiles become canonical links without tracking',()=>{
 assert.deepEqual(parseSaveUrl('https://www.instagram.com/reel/C9xYz_12AB/?igsh=MWQ1ZGUxMzBkMA==&utm_source=ig_web_copy_link'),{app:'instagram',kind:'reel',id:'C9xYz_12AB',canonicalUrl:'https://www.instagram.com/reel/C9xYz_12AB/',hint:''});
 assert.equal(parseSaveUrl('instagram.com/p/Cabc123/?img_index=2').canonicalUrl,'https://www.instagram.com/p/Cabc123/');
 assert.equal(parseSaveUrl('https://www.instagram.com/someone/reel/DAbc9/').canonicalUrl,'https://www.instagram.com/reel/DAbc9/');
 assert.equal(parseSaveUrl('https://instagram.com/reels/DAbc9').kind,'reel');
 const profile=parseSaveUrl('https://www.instagram.com/butcherandtherye/?hl=en');assert.equal(profile.kind,'profile');assert.equal(profile.hint,'@butcherandtherye');
 const share=parseSaveUrl('https://www.instagram.com/share/reel/BAQmF3x1Z/');assert.equal(share.kind,'share');assert.equal(share.canonicalUrl,'https://www.instagram.com/share/reel/BAQmF3x1Z/');
});
test('TikTok full and short links keep the video identity and drop sharer data',()=>{
 assert.deepEqual(parseSaveUrl('https://www.tiktok.com/@pghfoodie/video/7301234567890123456?is_from_webapp=1&sender_device=pc&_r=1'),{app:'tiktok',kind:'video',id:'7301234567890123456',canonicalUrl:'https://www.tiktok.com/@pghfoodie/video/7301234567890123456',hint:'@pghfoodie'});
 assert.equal(parseSaveUrl('https://vm.tiktok.com/ZMhAbC123/').kind,'short');
 assert.equal(parseSaveUrl('https://vt.tiktok.com/ZSxyz/?k=1').canonicalUrl,'https://vt.tiktok.com/ZSxyz/');
 assert.equal(parseSaveUrl('https://www.tiktok.com/t/ZTabc/').kind,'short');
});
test('YouTube shorts, watch and youtu.be links are canonical',()=>{
 assert.equal(parseSaveUrl('https://youtube.com/shorts/abcDEF12345?si=XYZ&feature=share').canonicalUrl,'https://www.youtube.com/shorts/abcDEF12345');
 assert.equal(parseSaveUrl('https://m.youtube.com/watch?v=abcDEF12345&t=42s&si=x').canonicalUrl,'https://www.youtube.com/watch?v=abcDEF12345');
 assert.equal(parseSaveUrl('https://youtu.be/abcDEF12345?si=q').kind,'video');
});
test('Google Maps place and short links; the place name is carried as a hint',()=>{
 const place=parseSaveUrl('https://www.google.com/maps/place/Butcher+and+the+Rye/@40.4424,-80.0022,17z/data=!3m1!4b1?entry=ttu');
 assert.equal(place.app,'google-maps');assert.equal(place.kind,'place');assert.equal(place.hint,'Butcher and the Rye');assert.equal(place.canonicalUrl,'https://www.google.com/maps/place/Butcher+and+the+Rye/');
 assert.deepEqual(parseSaveUrl('https://maps.app.goo.gl/AbC123xyz?g_st=ic'),{app:'google-maps',kind:'short',id:'AbC123xyz',canonicalUrl:'https://maps.app.goo.gl/AbC123xyz',hint:''});
 assert.equal(parseSaveUrl('https://maps.google.com/?cid=1234567890123').kind,'place');
 assert.equal(parseSaveUrl('https://www.google.com/maps/search/?api=1&query=40.44,-80.00').hint,'');
});
test('other web links lose tracking parameters but keep meaningful ones; garbage never throws',()=>{
 assert.deepEqual(parseSaveUrl('https://www.culturaldistrict.org/events/show?id=42&utm_campaign=fall&fbclid=abc#tickets'),{app:'web',kind:'page',id:'',canonicalUrl:'https://www.culturaldistrict.org/events/show?id=42',hint:''});
 for(const bad of [undefined,null,'',42,{},'not a url','javascript:alert(1)','ftp://x.example/a','https://user:pw@evil.example/','https://'+'a'.repeat(3000)+'.com','http://localhost/x'])assert.equal(parseSaveUrl(bad).app,'note');
});
test('share blobs are split into the first link and the words around it',()=>{
 assert.deepEqual(splitShare('','Omg we HAVE to go 😍 https://www.instagram.com/reel/abc/?igsh=1 tag someone'),{url:'https://www.instagram.com/reel/abc/?igsh=1',text:'Omg we HAVE to go 😍 tag someone'});
 assert.deepEqual(splitShare('https://vm.tiktok.com/ZM1/','https://vm.tiktok.com/ZM1/'),{url:'https://vm.tiktok.com/ZM1/',text:''});
});
test('relative dates resolve against the supplied day, not the server clock',()=>{
 const wed='2026-11-11';
 assert.equal(resolveDatePhrase('this Saturday',wed),'2026-11-14');
 assert.equal(resolveDatePhrase('Saturday night',wed),'2026-11-14');
 assert.equal(resolveDatePhrase('tonight',wed),wed);
 assert.equal(resolveDatePhrase('tomorrow',wed),'2026-11-12');
 assert.equal(resolveDatePhrase('this weekend',wed),'2026-11-14');
 assert.equal(resolveDatePhrase('next Friday',wed),'','ambiguous mid-week "next" is not guessed');
 assert.equal(resolveDatePhrase('next Wednesday',wed),'2026-11-18');
 assert.equal(resolveDatePhrase('Nov 22',wed),'2026-11-22');
 assert.equal(resolveDatePhrase('Saturday, November 22nd',wed),'2026-11-22');
 assert.equal(resolveDatePhrase('Jan 3',wed),'2027-01-03');
 assert.equal(resolveDatePhrase('2/30',wed),'');
 assert.equal(resolveDatePhrase('soon',wed),'');
 assert.equal(resolveDatePhrase('this Saturday','2026-11-14'),'2026-11-14');
});
test('a save source records canonical link, app and only valid dates',()=>{
 const s=saveSource({url:'https://youtu.be/abcDEF12345?si=x',text:'  ramen night ',savedAt:'2026-11-11T20:00:00.000Z',eventDate:'2026-11-14',expiresAt:'soon'});
 assert.deepEqual(s,{url:'https://www.youtube.com/watch?v=abcDEF12345',app:'youtube',text:'ramen night',savedAt:'2026-11-11T20:00:00.000Z',eventDate:'2026-11-14',expiresAt:''});
 assert.equal(saveSource({text:'that ramen place Sam mentioned'}).app,'note');
});
