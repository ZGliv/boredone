import previews from './data/photo-previews.json' with {type:'json'};
export const photoAtlas = previews.atlas;
export function photoPreview(photo){return photo && previews.photos[photo.originalUrl || photo.url];}
export function localPhoto(photo){const preview=photoPreview(photo);return preview?{...photo,originalUrl:photo.originalUrl||photo.url,url:preview.card}:photo;}
export function photoAtlasStyle(photo){const preview=photoPreview(photo);if(!preview)return {};return {backgroundImage:`url("${photoAtlas}")`,backgroundSize:`${previews.columns*100}% ${previews.rows*100}%`,backgroundPosition:`${preview.index%previews.columns/(previews.columns-1)*100}% ${Math.floor(preview.index/previews.columns)/(previews.rows-1)*100}%`};}

// Use source-host thumbnails for small map pins. Original URLs and credits stay
// on venue records and full-size detail photos. Unknown/signed URLs are untouched.
export function pinPhotoUrl(source){
 if(typeof source!=='string'||!source.startsWith('https://'))return source;
 let url;try{url=new URL(source);}catch{return source;}
 if([...url.searchParams.keys()].some(key=>/^(s|sig|signature|token|auth|expires|x-amz-.*)$/i.test(key)))return source;
 const host=url.hostname;
 if(host==='images.squarespace-cdn.com')url.searchParams.set('format','300w');
 else if(host==='static.wixstatic.com'&&url.pathname.startsWith('/media/')){
  const asset=url.pathname.split('/v1/')[0];
  if(!/\.(jpe?g|png|webp|avif)$/i.test(asset))return source;
  url.pathname=asset+'/v1/fill/w_160,h_160,q_80/file.webp';
 }else if(host==='images.getbento.com'||host.endsWith('.imgix.net')){
  url.searchParams.set('w','160');url.searchParams.set('h','160');
  if(!url.searchParams.has('fit'))url.searchParams.set('fit','max');
  url.searchParams.set('auto','compress,format');
 }else if(host==='cdn.shopify.com'||url.pathname.startsWith('/cdn/shop/')){
  url.searchParams.set('width','160');url.searchParams.delete('height');
 }else return source;
 return url.href;
}
