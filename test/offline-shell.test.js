import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync,readdirSync} from 'node:fs';
import {offlineShellPlugin} from "../server/offline-shell.js";
function worker(fetcher) {
  let source; const handlers={};
  offlineShellPlugin().generateBundle.call({emitFile:file=>{source=file.source;}},{},{"assets/app.js":{},"assets/app.css":{}});
  vm.runInNewContext(source,{URL,fetch:fetcher,self:{location:{origin:"https://boredone.test"},addEventListener:(type,handler)=>{handlers[type]=handler;}},caches:{open:async()=>({match:async()=>new Response("cached shell")})}});
  return request=>{let promise;handlers.fetch({request,respondWith:p=>{promise=p;}});return promise;};
}
const navigation={method:"GET",url:"https://boredone.test/",mode:"navigate"};
test("offline app shell recovers network failures and server5xx but preserves successful navigation",async()=>{
  assert.equal(await(await worker(async()=>new Response("down",{status:503}))(navigation)).text(),"cached shell");
  assert.equal(await(await worker(async()=>{throw Error("offline")})(navigation)).text(),"cached shell");
  assert.equal(await(await worker(async()=>new Response("current app"))(navigation)).text(),"current app");
});
test("app shell never intercepts API, external map requests or mutations",()=>{
  const handle=worker(()=>{throw Error("should not fetch")});
  for(const request of [{...navigation,url:"https://boredone.test/api/discover?lat=40"},{...navigation,url:"https://tiles.openfreemap.org/tile"},{...navigation,method:"POST"}])assert.equal(handle(request),undefined);
});

test("an app update activates only after its complete offline shell is cached",async()=>{
 let source,install,finish;const order=[];
 offlineShellPlugin().generateBundle.call({emitFile:file=>{source=file.source;}},{},{"assets/app.js":{}});
 vm.runInNewContext(source,{URL,self:{location:{origin:"https://boredone.test"},addEventListener:(type,handler)=>{if(type==='install')install=handler;},skipWaiting:()=>order.push('activate')},caches:{open:async()=>({addAll:()=>new Promise(resolve=>{finish=()=>{order.push('cached');resolve();};})})}});
 let done;install({waitUntil:p=>{done=p;}});await Promise.resolve();assert.deepEqual(order,[]);finish();await done;assert.deepEqual(order,['cached','activate']);
});

function photoWorker({store=new Map(),failWrite=false,fetcher,initialCaches=[]}={}) {
 let source;const handlers={},cachesByName=new Map([['boredone-photo-previews-v1',store],...initialCaches]);
 offlineShellPlugin().generateBundle.call({emitFile:file=>{source=file.source;}},{},{'assets/app.js':{}});
 const cacheFor=entries=>({
  match:async key=>entries.get(new URL(typeof key==='string'?key:key.url,'https://boredone.test').pathname)?.clone(),
  put:async(key,response)=>{if(failWrite)throw Error('quota');entries.set(new URL(typeof key==='string'?key:key.url,'https://boredone.test').pathname,response);},
  keys:async()=>[...entries.keys()].map(path=>({url:'https://boredone.test'+path})),
  delete:async key=>entries.delete(new URL(typeof key==='string'?key:key.url,'https://boredone.test').pathname)
 });
 vm.runInNewContext(source,{URL,self:{location:{origin:'https://boredone.test'},addEventListener:(type,fn)=>{handlers[type]=fn;},clients:{claim:async()=>{}}},fetch:fetcher||(async()=>new Response('pixels',{headers:{'content-type':'image/webp'}})),caches:{match:async path=>{for(const entries of cachesByName.values()){const hit=await cacheFor(entries).match(path);if(hit)return hit;}},open:async name=>{if(!cachesByName.has(name))cachesByName.set(name,new Map());return cacheFor(cachesByName.get(name));},keys:async()=>[...cachesByName.keys()],delete:async name=>cachesByName.delete(name)}});
 return {store,cachesByName,async warm(){let done;handlers.message({data:'warm-guide-photos',waitUntil:p=>{done=p;}});await done;},async request(path){let response;const pending=[];handlers.fetch({request:{url:'https://boredone.test'+path,method:'GET',mode:'no-cors'},respondWith:p=>{response=p;},waitUntil:p=>pending.push(p)});const result=await response;await Promise.all(pending);return result;},async activate(){let done;handlers.activate({waitUntil:p=>{done=p;}});await done;}};
}
const previews=JSON.parse(readFileSync(new URL('../src/data/photo-previews.json',import.meta.url)));
const paths=[...new Set(Object.values(previews.photos).map(p=>p.card))];
test('viewed photos survive worker restart and release activation without network requests',async()=>{
 let fetched=0;const store=new Map(),first=photoWorker({store,fetcher:async()=>{fetched++;return new Response('real photo',{headers:{'content-type':'image/webp'}});}});
 assert.equal(await(await first.request(paths[0])).text(),'real photo');assert.equal(fetched,1);
 store.set('/photo-previews/retired.webp',new Response('retired'));
 const reopened=photoWorker({store,fetcher:async()=>{throw Error('offline');}});await reopened.activate();
 assert.equal(await(await reopened.request(paths[0])).text(),'real photo');assert.equal(store.has('/photo-previews/retired.webp'),false);
});
test('concurrent photo caching stays bounded and excludes failed/non-image responses',async()=>{
 const worker=photoWorker();await Promise.all(paths.slice(0,145).map(path=>worker.request(path)));assert.equal(worker.store.size,128);
 for(const response of [new Response('not found',{status:404}),new Response('html',{headers:{'content-type':'text/html'}})]){const failed=photoWorker({fetcher:async()=>response});await failed.request(paths[0]);assert.equal(failed.store.size,0);}
});
test('storage quota failure does not break successful photo delivery',async()=>{
 const worker=photoWorker({failWrite:true});assert.equal(await(await worker.request(paths[0])).text(),'pixels');assert.equal(worker.store.size,0);
});

const guidePath='/guide-photos/'+readdirSync(new URL('../public/guide-photos/',import.meta.url)).find(name=>name.endsWith('.jpg'));
test('critical install excludes optional guide photographs but keeps the map atlas',async()=>{
 let source,install,assets;
 offlineShellPlugin().generateBundle.call({emitFile:file=>{source=file.source;}},{},{'assets/app.js':{}});
 vm.runInNewContext(source,{URL,self:{location:{origin:'https://boredone.test'},addEventListener:(type,fn)=>{if(type==='install')install=fn;},skipWaiting:()=>{}},caches:{open:async()=>({addAll:async paths=>{assets=[...paths];}})}});
 let done;install({waitUntil:p=>{done=p;}});await done;
 assert.equal(assets.some(path=>path.startsWith('/guide-photos/')),false);
 assert.ok(assets.includes(previews.atlas));assert.ok(assets.includes('/index.html'));
});
test('release upgrade preserves legacy guide photos for offline reopening',async()=>{
 const old=new Map([[guidePath,new Response('legacy pixels')]]);
 const w=photoWorker({initialCaches:[['boredone-shell-vold',old]],fetcher:async()=>{throw Error('offline');}});
 await w.activate();
 assert.equal(await(await w.request(guidePath)).text(),'legacy pixels');
 assert.equal(w.cachesByName.has('boredone-shell-vold'),false);
});
test('failed legacy-photo migration retains the old cache',async()=>{
 const old=new Map([[guidePath,new Response('legacy pixels')]]);
 const w=photoWorker({initialCaches:[['boredone-shell-vold',old]],failWrite:true,fetcher:async()=>{throw Error('offline');}});await w.activate();
 assert.equal(w.cachesByName.has('boredone-shell-vold'),true);
 assert.equal(await(await w.request(guidePath)).text(),'legacy pixels');
});
test('optional photo warming limits concurrency and tolerates offline failure',async()=>{
 let active=0,peak=0;const w=photoWorker({fetcher:async()=>{peak=Math.max(peak,++active);await new Promise(resolve=>setTimeout(resolve,1));active--;throw Error('offline');}});
 await w.warm();assert.ok(peak<=2);assert.equal(w.cachesByName.get('boredone-guide-photos-v1').size,0);
});

