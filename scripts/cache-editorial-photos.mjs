// Bundle licensed Commons images so the included guide works offline.
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const file=process.argv[2];if(!file)throw Error('Provide an editorial JSON file');
const guide=JSON.parse(await readFile(file));await mkdir('public/guide-photos',{recursive:true});
for(const place of guide.places.filter(p=>p.photo).slice(0,80)){
 const photo=place.photo,remote=photo.remoteUrl||photo.url;
 if(photo.url.startsWith('/guide-photos/')){try{await access('public'+photo.url);continue;}catch{}}
 const url=new URL(remote);
 if(url.protocol!=='https:'||!['thumb.wikimedia.org','upload.wikimedia.org'].includes(url.hostname))throw Error('Unapproved image host');
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(25000),headers:{'User-Agent':'Bordone/0.5 (https://boredone.vercel.app)'}});
 if(!response.ok)throw Error(`Image unavailable: ${response.status}`);
 const mime=response.headers.get('content-type')?.split(';')[0],ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[mime];if(!ext)throw Error('Unsupported image');
 const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>3*1024*1024)throw Error('Image too large');chunks.push(chunk);}
 const name=createHash('sha256').update(remote).digest('hex').slice(0,20)+'.'+ext;
 await writeFile('public/guide-photos/'+name,Buffer.concat(chunks));photo.remoteUrl=remote;photo.url='/guide-photos/'+name;
 console.log(place.name,size,photo.license);
}
await writeFile(file,JSON.stringify(guide,null,2)+'\n');
