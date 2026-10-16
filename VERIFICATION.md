# Boredone pilot verification — October 15, 2026

## Release

- Source: `/Users/Test/Developer/boredone`
- Stable production: https://boredone.vercel.app/
- Verified production deployment: `dpl_5ePUtzmvyrgc4x2hbcDJxgQ45GBP`
- Immutable URL: https://boredone-6bwskvudi-zgliv21-gmailcoms-projects.vercel.app
- Runtime JS asset: `index-aGXSfIor.js`; Vite 6.4.4, Node 24.x production.
- Existing Vercel Hobby team; no new paid service or account. Deployment protection settings were left unchanged. The stable production alias opened directly in a clean browser.
- Original archived Expo directory and the three-app recovered prototype bundle were not modified.

## Checks and results

- `npm test`: 11 passing tests for backup round-trip, newer-edit merge/idempotence, duplicate/malformed/oversized input rejection, date-only values, future-memory rejection, safe URLs, bounded discovery query validation, approximate coordinates, normalized sourced venues and API failure responses.
- `npm run build`: passing. Production JS 330.62 kB / 102.29 kB gzip on Vercel.
- `npm audit --json`: zero reported vulnerabilities, including dev dependencies, after updating Vite to 6.4.4.
- Real hosted city search: GeoNames Pittsburgh, Pennsylvania, US selected from bundled data.
- Real hosted discovery: 36 culture venues within 3 km returned from OpenStreetMap through the VK Maps fallback. Examples: Pittsburgh Playhouse, Benedum Center, Heinz Hall. Source and retrieval date displayed. Private.coffee was returning HTTP 500; no fake results were substituted.
- Hosted core loop: select actual Pittsburgh Playhouse → save plan with a note → reload → mark visited → save memory → reload. The place, note and visited status persisted.
- Latest hosted release: add a test screenshot through the real photo input → resize/store → reload with loaded image → export through browser download. Export contains the full photo data and note. All test content is synthetic and browser-local.
- Local fresh-browser recovery: export in one isolated browser session → import in a different empty session → merge → reload. Photo, date, note and rating restored.
- Invalid backup: malformed outing rejected; no merge confirmation and no prior memory/photo mutation.
- Cross-tab conflict: open the same memory in two tabs, save the second tab, attempt stale save in the first. Stale editor rejected; newer note remained after reload.
- Storage quota fault injection: make IndexedDB `put` throw `QuotaExceededError`; saving shows a specific error. Previous saved note/photo remain after reload. No success state was shown for the failed write.
- Simulated location denial: visible city-search alternative. Simulated discovery HTTP 503: clear retryable error; manual capture remains available.
- Screens inspected at 375 × 812 and 1440 × 1000; document widths exactly equal viewport widths. Solid mobile nav; native dialog scroll; no horizontal overflow.
- Production browser console: zero errors/warnings after real discovery, save, photo and export flow.

## Evidence

All under `output/playwright/` (ignored by Git and deployment):

- `boredone-live-1440.png`: production desktop home.
- `boredone-discovery-1440.png`: actual sourced venues and map pins.
- `boredone-live-375.png`: production mobile home.
- `boredone-memory-375.png`: persisted hosted memory/photo; uses a test screenshot as the uploaded image.
- `journal-backup.json`: local export used in fresh-browser restoration.
- `live-journal-backup.json`: hosted export with synthetic memory/photo.
- `check-conflicts.js`: browser conflict/quota scenario.
- `npm-audit.json`: dependency audit output.

## Remaining limits

This is a usable personal pilot, not a hosted multi-user product. Journal data is local and unencrypted; backups are essential. Maximum 500 outings, six photos per outing and 50 MB total exportable journal. No live events, ticket availability, booking, calendar reminders, account sync, sharing, HEIC or video. Public Overpass availability and OSM accuracy vary; a broader launch needs a reliability/capacity decision and real user validation. A browser request reveals an approximate search area to the provider; map tiles reveal the viewed area/IP to OSM. These are disclosed in Journal settings.
