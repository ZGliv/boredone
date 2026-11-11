"""Explicit maintainer build: reviewed source photos -> compact, attributed previews.
Requires Pillow. Never discovers or substitutes photos. Source records/credits stay
in the guide; this delivery index is keyed by the exact approved source URL.
Run after writing sources.json from bundledArea (see DISCOVERY_ENGINE.md).
"""
from pathlib import Path
from PIL import Image, ImageOps
import hashlib, json, math, io, sys
root=Path(__file__).resolve().parents[1]
places=json.loads(Path(sys.argv[1]).read_text())
audit={p.name:p for p in (root/'output').rglob('*.image')}
out=root/'public/photo-previews'; out.mkdir(exist_ok=True)
urls=sorted({p['photo']['url'] for p in places});cols=16;rows=math.ceil(len(urls)/cols);tile=96
atlas=Image.new('RGB',(cols*tile,rows*tile),'#fffcf1');photos={};source_bytes=0;card_bytes=0
for i,url in enumerate(urls):
 source=root/('public'+url) if url.startswith('/') else audit[hashlib.sha256(url.encode()).hexdigest()[:20]+'.image']
 source_bytes+=source.stat().st_size
 with Image.open(source) as original:
  photo=ImageOps.exif_transpose(original).convert('RGB')
  atlas.paste(ImageOps.fit(photo,(tile,tile),method=Image.Resampling.LANCZOS),((i%cols)*tile,(i//cols)*tile))
  photo.thumbnail((640,640),Image.Resampling.LANCZOS)
  buf=io.BytesIO();photo.save(buf,'WEBP',quality=76,method=6);data=buf.getvalue()
  name=hashlib.sha256(data).hexdigest()[:20]+'.webp';(out/name).write_bytes(data);card_bytes+=len(data)
  photos[url]={'card':'/photo-previews/'+name,'index':i}
buf=io.BytesIO();atlas.save(buf,'WEBP',quality=73,method=6);data=buf.getvalue()
name='pins-'+hashlib.sha256(data).hexdigest()[:20]+'.webp';(out/name).write_bytes(data)
manifest={'atlas':'/photo-previews/'+name,'columns':cols,'rows':rows,'photos':photos}
(root/'src/data/photo-previews.json').write_text(json.dumps(manifest,separators=(',',':'))+'\n')
# Only generated files no longer referenced by this delivery manifest are removed.
keep={name}|{Path(p['card']).name for p in photos.values()}
for path in out.glob('*.webp'):
 if path.name not in keep:path.unlink()
print(json.dumps({'venues':len(places),'uniquePhotos':len(urls),'sourceBytes':source_bytes,'atlasBytes':len(data),'allCardsBytes':card_bytes,'atlas':manifest['atlas']}))
