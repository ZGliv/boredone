"""Refresh the attributed city directory. No service key or geocoding calls required."""
import io
import json
from pathlib import Path
import urllib.request
import zipfile

root = Path(__file__).resolve().parent.parent
base = 'https://download.geonames.org/export/dump/'
with urllib.request.urlopen(base + 'cities15000.zip', timeout=60) as response:
    archive = zipfile.ZipFile(io.BytesIO(response.read()))
with urllib.request.urlopen(base + 'admin1CodesASCII.txt', timeout=60) as response:
    admins = {row[0]: row[1] for line in response.read().decode().splitlines()
              if len(row := line.split('\t')) > 1}
rows = []
for line in archive.read('cities15000.txt').decode().splitlines():
    c = line.split('\t')
    rows.append([c[0], c[1], c[2], admins.get(c[8] + '.' + c[10], c[10]), c[8],
                 round(float(c[4]), 5), round(float(c[5]), 5), int(c[14])])
rows.sort(key=lambda row: -row[7])
(root / 'public/cities.json').write_text(json.dumps(rows, ensure_ascii=False, separators=(',', ':')))
print(f'Updated {len(rows)} GeoNames cities. Update docs/geonames-attribution.txt with the retrieval date and count before release.')
