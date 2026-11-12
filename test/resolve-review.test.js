// Adversarial cases from the independent review of the save resolver.
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchCandidates,nameSimilarity} from '../src/saveMatch.js';
import {parseSaveUrl,resolveDatePhrase,SAVE_APPS} from '../src/saveSource.js';
import {createResolver,MAX_TEXT} from '../server/resolve-save.js';
const places=JSON.parse(readFileSync(new URL('../src/data/pittsburgh.json',import.meta.url))).places;
const downtown={lat:40.4406,lng:-79.9959};
const names=(name,kind='restaurant')=>matchCandidates([{name,kind}],places,downtown)[0].matches.map(m=>m.place.name);

test('matcher: one word shared by several different businesses is a category, not a guess',()=>{
 for(const word of ['Pizza','Pittsburgh Pizza','Sushi','Tacos','Grill','Burger','The Bar','Bar','Coffee'])assert.deepEqual(names(word),[],word);
});
test('matcher: a caption name with a distinctive word the place lacks is a different place',()=>{
 assert.deepEqual(names('Pizza Milano'),[],'Pizza Milano is not Cafe Milano');
 assert.deepEqual(names('Milano'),['Cafe Milano'],'the partial name still finds it');
 assert.ok(nameSimilarity('Pizza Milano','Cafe Milano')<.74);assert.ok(nameSimilarity('Milano','Cafe Milano')>=.74);
});
test('matcher: one letter apart in a short word is a different word',()=>{
 assert.deepEqual(names('Taco Bar'),[],'"taco" is not "Täkō"');
 assert.deepEqual(names('Lucha'),[],'"Lucha" is not "Mamma Lucia"');
 assert.ok(!names('Burger').includes('Burghers Brewing'));
 assert.deepEqual(names('Speckeld Egg'),['The Speckled Egg'],'a typo in a longer word is still tolerated');
});
test('matcher: chains, substrings and exact near-duplicates still resolve without guessing',()=>{
 assert.ok(names('Primanti').length>=4);
 assert.ok(names('Starbucks','cafe').every(n=>n==='Starbucks'));
 assert.deepEqual(names("Mike's"),["Mike's Beer Bar"]);
 assert.deepEqual(names('Burghers Brewing','bar'),['Burghers Brewing'],'the exactly named branch, not the South Side beer garden');
});

const ODD=[undefined,null,'',' ',42,{},[],NaN,'hello','javascript:alert(1)','JaVaScRiPt:alert(1)','data:text/html,<script>alert(1)</script>','file:///etc/passwd','ftp://example.com/x','mailto:a@b.co','http://localhost/x','http://[::1]/','https://user:pass@instagram.com/p/abc/','https://xn--80ak6aa92e.com/path?utm_source=x&id=1','https://пример.рф/путь?fbclid=1','https://ínstagram.com/p/abc','https://instagram.com.evil.com/p/abc/','https://evilinstagram.com/p/abc/','https://instagram.com/p/','https://instagram.com/reel/','https://www.instagram.com/../../etc','https://www.tiktok.com/@/video/1','https://youtu.be/','https://www.google.com/maps/place/%E0%A4%A','https://www.google.com/maps/place/<script>alert(1)</script>','https://example.com/#frag?utm_source=x','instagram.com','www.example.com','example','https://'+'a'.repeat(3000)+'.com','http://example.com:99999/','https://exa mple.com','‮https://evil.com','https://example.com/\u0000x','%%%','://','https://','https://.com','https://a..b/','\ud800'];
test('parseSaveUrl: 40+ odd inputs never throw, never keep a non-http scheme, never invent a profile',()=>{
 assert.ok(ODD.length>=40);
 for(const u of ODD){
  const r=parseSaveUrl(u);assert.ok(SAVE_APPS.includes(r.app),String(u));
  if(r.canonicalUrl)assert.match(r.canonicalUrl,/^https?:\/\//,String(u));
 }
 for(const u of ['javascript:alert(1)','data:text/html,x','file:///etc/passwd','mailto:a@b.co'])assert.equal(parseSaveUrl(u).app,'note');
 assert.equal(parseSaveUrl('https://ínstagram.com/p/abc').app,'web','a look-alike host is not Instagram');
 assert.equal(parseSaveUrl('https://instagram.com.evil.com/p/abc/').app,'web');
 for(const u of ['https://instagram.com/p/','https://instagram.com/reel/','https://instagram.com/tv/'])assert.notEqual(parseSaveUrl(u).kind,'profile',u);
});
test('resolveDatePhrase: only real day and month names are dates',()=>{
 for(const w of ['sunny','satisfying','monster','wedding','frisbee','thunder','mayor 7','marching 5','junk 1','decent 4'])assert.equal(resolveDatePhrase(w,'2026-11-11'),'',w);
 assert.equal(resolveDatePhrase('Sat','2026-11-11'),'2026-11-14');assert.equal(resolveDatePhrase('Thurs','2026-11-11'),'2026-11-12');
 assert.equal(resolveDatePhrase('Sept 3rd','2026-11-11'),'2027-09-03');assert.equal(resolveDatePhrase('Fri Nov 20','2026-11-11'),'2026-11-20');
});

const NOW=Date.parse('2026-11-11T22:00:00Z');const KEY={ANTHROPIC_API_KEY:'test-key-not-real'};
const cand=o=>({name:'',venue:'',city:'',kind:'restaurant',dateText:'',eventDate:'',expiresAt:'',confidence:.9,evidence:'',...o});
function mock(candidates){const calls=[];return {calls,callModel:async p=>{calls.push(p);return {stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({candidates})}]};}};}
const resolver=m=>createResolver({env:KEY,callModel:m.callModel,now:()=>NOW});
test('resolver: a video link alone needs text; the poster handle is not the venue',async()=>{
 for(const url of ['https://www.tiktok.com/@pghfoodie/video/7301234567890123456','https://www.instagram.com/stories/pghfoodie/3301234567/']){
  const m=mock([cand({name:'PGH Foodie',evidence:'@pghfoodie'})]);const r=await resolver(m)({url});
  assert.equal(r.status,'needs-text',url);assert.equal(m.calls.length,0,url);
 }
 const m=mock([]);await resolver(m)({url:'https://www.tiktok.com/@pghfoodie/video/7301234567890123456',text:'tacos at Condado'});
 assert.match(m.calls[0].messages[0].content,/posted it \(often a creator, not the venue\): @pghfoodie/);
 const p=mock([]);await resolver(p)({url:'https://www.instagram.com/butcherandtherye/'});assert.equal(p.calls.length,1,'an account link still names the thing saved');
});
test('resolver: a name must be grounded in its own evidence, not in any word of the caption',async()=>{
 const m=mock([cand({name:'Primanti Bros.',evidence:'night'}),cand({name:'Evil Corp',evidence:'the'}),cand({name:'Condado Tacos',evidence:'Condado'})]);
 const r=await resolver(m)({text:'great night out, the margs at Condado'});
 assert.deepEqual(r.candidates.map(c=>c.name),['Condado Tacos']);
});
test('resolver: an event venue the text never names is cleared before matching',async()=>{
 const m=mock([cand({name:'Steelers game',kind:'event',venue:'Acrisure Stadium',evidence:'Steelers game'}),cand({name:'Holiday Market',kind:'event',venue:'Market Square',evidence:'Holiday Market'})]);
 const r=await resolver(m)({text:'Steelers game Sunday then the Holiday Market in Market Square'});
 assert.equal(r.candidates[0].venue,'');assert.equal(r.candidates[1].venue,'Market Square');
});
test('resolver: the text cap never splits an emoji into a lone surrogate',async()=>{
 const m=mock([]);const r=await resolver(m)({text:'Mia'+'🍕'.repeat(MAX_TEXT)});
 assert.equal(r.truncated,true);assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(m.calls[0].messages[0].content));
});
