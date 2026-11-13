# Included Pittsburgh place guide

120 real places from the existing user-requested neighborhood guide, included October 27, 2026. Original dataset date: October 25, 2026. Raw provider provenance, coordinates, IDs and unknown fields are preserved in `pittsburgh.json`; this is not sample data. The guide is bundled in the app JavaScript and offline shell, so opening the default city requires no API search or area download.

Source: OpenMapTiles / OpenStreetMap, delivered by OpenFreeMap. © OpenStreetMap contributors, ODbL: https://www.openstreetmap.org/copyright . Dataset and attribution details are in the JSON. No venue photos, event times or opening hours were invented. Updates are explicit; this is not live availability. Other cities use the existing city-selection discovery flow and per-browser saved guides.

October 27 venue revision (poolVersion 3): the included guide now contains only eligible going-out venues. It includes 22 restaurants, 15 bars, 15 pubs, 4 nightclubs, 34 cafes, 8 bakeries, 15 theatres, 2 cinemas, 4 ice-cream shops and 1 mini-golf venue. `scripts/build-venue-guide.mjs` supports explicit bounded guide rebuilds through the same engine; it is not a background scraper.

## Free editorial enrichment, October 27

`pittsburgh-editorial.json` contains 32 real Wikivoyage Eat/Drink listings, 29 descriptions and three verified Commons venue photos. Excerpts are adapted plain text under CC BY-SA 4.0, with exact revision URLs per listing. Listing dates may be old or unknown; these are not live availability claims. Photo authors, source URLs and individual licenses are retained in every photo record and `public/guide-photos/CREDITS.md`. The snapshot is marked partial after an optional upstream failure. `docs/DISCOVERY_ENGINE.md` documents bounded retrieval, ranking, explicit refresh commands and the zero-budget decision.

## Expanded city coverage — October 27, 2026

The current merged public guide exposes 624 venues within 5 km, including 360 restaurants and 116 bars/pubs; 50 have editorial descriptions and 14 have matched licensed photos. This supersedes earlier 120-place/29-pick/3-photo counts above. The raw base snapshot retains source dates and IDs; source-backed corrections remove known closed locations without editing private journals. Photo records retain author, license, original remote URL, match evidence and capture date when present. No generic image placeholders are used.

Source/identity audit: `output/playwright/coverage/photo-audit.jpg`; full retrieval evidence is kept beside the build logs. `venue-corrections.json` lists source-linked exclusions. `docs/DISCOVERY_ENGINE.md` documents bounds, refresh steps, limitations and verification.


## October 28 current local coverage and gallery research

This supersedes historical counts below. **613 venues; 289 with bundled photo previews; 217/465 restaurants, bars and pubs with photos (46.7%)**. There are 280 reviewed website-photo records, 14 licensed offline photos (five overlap), 415 website URLs and 53 editorial descriptions. Majority restaurant/bar coverage remains incomplete. Eleven newly source-backed closure exclusions reduced the public catalog from 624; saved outings remain intact.

`node scripts/enrich-website-galleries.mjs /tmp/verified-websites.json /tmp/gallery-candidates.json` extends metadata extraction to responsive/lazy images and CSS backgrounds. It accepts at most 700 explicit input venues, uses five concurrent venue jobs, fetches the homepage plus at most two same-origin gallery/menu/about/location pages, and uses identified requests, robots checks, public HTTPS/DNS protections, nine-second page timeouts and 1.6 MB HTML limits. It emits candidates, not approved photos. Audit HTML and original image files remain research outputs. The October 29 preview build derives compact delivery assets only from the already-approved image records. Source/branch identity and actual pixels require review before publication; same-origin does not establish the correct branch.

Approved records retain venue ID, source page, image URL, date, dimensions and business/brand scope in `src/data/pittsburgh-websites.json`. Audit manifests are `output/photo-expansion-oct28/approved-*.json`; exact totals are in `coverage.json`. Original website-photo records remain attributed and are not asserted to be openly licensed. The October 29 delivery layer now supplies same-origin reduced previews and browser caching; original source records remain unchanged. Rejected hijacked domains also suppress earlier remote previews. Stable provider IDs win over ambiguous name matching. After publishing, bump the public bundle revision and update exact image hosts in `vercel.json`, then restart the preview to apply its headers.

Living City now opens on all 613 individual venues, with nothing selected and no numbered clusters. The 289 photo pins share a compact same-origin photo sheet. Cards stay on the tapped place; vertical gestures dismiss/expand, with no horizontal carousel. Tonight and permanent journal data remain separate. Production: https://boredone.vercel.app . See `docs/DISCOVERY_ENGINE.md`, the Bordone project plan and `output/playwright/photo-cache/` for the current release and verification.


October 29 website-photo expansion: current guide 613 places, 329 with photos; 257/465 restaurant/bar/pub records (55.3%). Added 40 reviewed photo records / 36 distinct source images, preserving the original credits and brand scope. Evidence: `output/photo-expansion-oct29/published-additions.json`. Full delivery set: 291 sources, 661,350-byte cached map atlas and content-hashed card previews. Catalog revision `venue-websites-5`; private saved data unchanged.

October 29 follow-up: 337/613 records have photos, including 265/465 food/drink records. Eight additional records and their sources are listed in `output/photo-expansion-next/published-additions.json`. Atlas: 670,378 bytes, 295 source photos; guide revision `venue-websites-6`.

October 29 corridor: `south-hills-corridor.json` holds 295 directory records from Southpointe, Bridgeville and South Hills; the area combines them with 150 downtown records and displays 445 places/136 photos. Photo audit: `output/corridor/selected.json`. The shared 720,242-byte atlas covers both guides.

November 12 map photos: `place-photos.json` is derived, not hand-edited — `node scripts/build-place-photos.mjs` keeps the old guide's 614 places that have a bundled preview (18 licensed, 596 venue-website), each with its atlas cell, card preview and full original photo record for credits. The Map pairs them to pack places by id, then `sameVenue`; `test/place-photos.test.js` fails if the file is stale.
