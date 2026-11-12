import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

const photos = JSON.parse(readFileSync(new URL('../src/data/photo-previews.json',import.meta.url)));
// Install the usable app first. Full-size public guide photos warm separately;
// no API responses or private journal data enter these caches.
export function offlineShellPlugin() {
  return {
    name: "boredone-offline-shell", apply: "build",
    generateBundle(_options, bundle) {
      const publicFiles = [photos.atlas, "/manifest.webmanifest", "/app-icons-v2/icon-32.png", "/app-icons-v2/icon-180.png", "/app-icons-v2/icon-192.png", "/app-icons-v2/icon-512.png"];
      const guidePhotos = readdirSync(new URL("../public/guide-photos/",import.meta.url)).filter(name => /\.(jpg|png|webp)$/.test(name)).map(name=>"/guide-photos/"+name);
      // City packs are large; only the default one installs with the shell.
      // Others are cached the first time they are opened.
      const isPack = name => /city-packs\//.test(bundle[name]?.facadeModuleId || "");
      const packs = Object.keys(bundle).filter(isPack);
      const later = packs.filter(name => !/city-packs\/pittsburgh\.json/.test(bundle[name].facadeModuleId));
      const assets = ["/index.html", ...Object.keys(bundle).filter(name => /\.(js|css|woff2)$/.test(name) && !later.includes(name)).map(name => "/" + name), ...publicFiles];
      const hash = createHash("sha256").update(JSON.stringify(assets)).update(readFileSync(new URL("../index.html", import.meta.url)));
      for (const file of publicFiles) hash.update(readFileSync(new URL("../public" + file, import.meta.url)));
      const cache = "boredone-shell-v" + hash.digest("hex").slice(0,16);
      this.emitFile({type:"asset", fileName:"sw.js", source: `
const CACHE = ${JSON.stringify(cache)};
const PACKS = new Set(${JSON.stringify(later.map(name => "/" + name))});
const PACK_CACHE = 'boredone-city-packs-v1';
const ASSETS = ${JSON.stringify(assets)};
const PHOTO_CACHE = 'boredone-photo-previews-v1';
const PHOTO_PATHS = new Set(${JSON.stringify([...new Set(Object.values(photos.photos).map(p=>p.card))])});
const MAX_PHOTOS = 128;
const GUIDE_CACHE = 'boredone-guide-photos-v1';
const GUIDE_PHOTOS = ${JSON.stringify(guidePhotos)};
let warming;
function warmGuides() {
  if (warming) return warming;
  warming = (async () => {
    const cache = await caches.open(GUIDE_CACHE);
    const queue = [...GUIDE_PHOTOS];
    async function next() {
      while (queue.length) {
        const path = queue.shift();
        try {
          if (await cache.match(path)) continue;
          const response = await fetch(path);
          if (response.ok && response.headers.get('content-type')?.startsWith('image/')) await cache.put(path,response);
        } catch {} // Optional photos cannot prevent offline journal access.
      }
    }
    await Promise.all([next(),next()]);
  })().catch(() => {}).finally(() => { warming = null; });
  return warming;
}
self.addEventListener('message', event => {
  if (event.data === 'warm-guide-photos') event.waitUntil(warmGuides());
});
let photoWrites = Promise.resolve();
function rememberPhoto(cache, request, response) {
  // Serialize eviction: concurrent image completions cannot exceed the bound.
  photoWrites = photoWrites.catch(() => {}).then(async () => {
    try {
      await cache.put(request, response);
      const keys = await cache.keys();
      for (const key of keys.slice(0, Math.max(0, keys.length - MAX_PHOTOS))) await cache.delete(key);
    } catch {} // Full/disabled browser storage must never hide a downloaded photo.
  });
  return photoWrites;
}
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    for (const key of keys.filter(key => key.startsWith('boredone-shell-v') && key !== CACHE)) {
      // Preserve photos downloaded by older releases before retiring their shell.
      try {
        const old = await caches.open(key), guides = await caches.open(GUIDE_CACHE);
        for (const path of GUIDE_PHOTOS) {
          if (await guides.match(path)) continue;
          const photo = await old.match(path);
          if (photo) await guides.put(path, photo);
        }
        await caches.delete(key);
      } catch {} // Keep the old cache if copying fails; never discard its photos.
    }
    try {const cache=await caches.open(PACK_CACHE);for(const request of await cache.keys())if(!PACKS.has(new URL(request.url).pathname))await cache.delete(request);}catch{}
    try {const cache=await caches.open(PHOTO_CACHE);for(const request of await cache.keys())if(!PHOTO_PATHS.has(new URL(request.url).pathname))await cache.delete(request);}catch{}
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (GUIDE_PHOTOS.includes(url.pathname)) {
    let finish; const written = new Promise(resolve => { finish=resolve; });
    event.waitUntil(written);
    event.respondWith((async () => {
      try {
        let cache;
        try { cache=await caches.open(GUIDE_CACHE); const hit=(await cache.match(url.pathname)) || (await caches.match(url.pathname)); if(hit)return hit; } catch {}
        const response=await fetch(event.request);
        if(cache && response.ok && response.headers.get('content-type')?.startsWith('image/')) {
          try { await cache.put(url.pathname,response.clone()); } catch {}
        }
        return response;
      } finally { finish(); }
    })());
  } else if (PHOTO_PATHS.has(url.pathname)) {
    // One lifetime promise includes the write, even when the response is handed
    // to the page early. Cache failures fall back to ordinary network delivery.
    let finishWrite;const written=new Promise(resolve=>{finishWrite=resolve;});event.waitUntil(written);
    event.respondWith((async()=>{
      try {
        let cache;try {cache=await caches.open(PHOTO_CACHE);const hit=await cache.match(url.pathname);if(hit)return hit;}catch{}
        const response=await fetch(event.request);
        if(cache&&response.ok&&response.headers.get('content-type')?.startsWith('image/')) {
          rememberPhoto(cache,url.pathname,response.clone()).finally(finishWrite);finishWrite=null;
        }
        return response;
      } finally {if(finishWrite)finishWrite();}
    })());
  } else if (PACKS.has(url.pathname)) {
    // Content-hashed city pack: cache first, kept until a release drops it.
    event.respondWith((async () => {
      let cache;
      try { cache = await caches.open(PACK_CACHE); const hit = await cache.match(url.pathname); if (hit) return hit; } catch {}
      const response = await fetch(event.request);
      if (cache && response.ok) event.waitUntil(cache.put(url.pathname, response.clone()).catch(() => {}));
      return response;
    })());
  } else if (event.request.mode === 'navigate') {
    const fallback = () => caches.open(CACHE).then(cache => cache.match('/index.html'));
    event.respondWith(fetch(event.request).then(response => response.status >= 500 ? fallback() : response).catch(fallback));
  } else if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname)) || fetch(event.request)));
  }
});
`});
    },
  };
}
