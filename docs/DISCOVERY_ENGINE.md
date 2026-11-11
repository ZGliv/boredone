# Bordone discovery engine — $0 API budget

## October 28 current local coverage and gallery research

This supersedes historical counts below. **613 venues; 289 with bundled photo previews; 217/465 restaurants, bars and pubs with photos (46.7%)**. There are 280 reviewed website-photo records, 14 licensed offline photos (five overlap), 415 website URLs and 53 editorial descriptions. Majority restaurant/bar coverage remains incomplete. Eleven newly source-backed closure exclusions reduced the public catalog from 624; saved outings remain intact.

`node scripts/enrich-website-galleries.mjs /tmp/verified-websites.json /tmp/gallery-candidates.json` extends metadata extraction to responsive/lazy images and CSS backgrounds. It accepts at most 700 explicit input venues, uses five concurrent venue jobs, fetches the homepage plus at most two same-origin gallery/menu/about/location pages, and uses identified requests, robots checks, public HTTPS/DNS protections, nine-second page timeouts and 1.6 MB HTML limits. It emits candidates, not approved photos. Audit HTML and original image files remain research outputs. The October 29 preview build derives compact delivery assets only from the already-approved image records. Source/branch identity and actual pixels require review before publication; same-origin does not establish the correct branch.

Approved records retain venue ID, source page, image URL, date, dimensions and business/brand scope in `src/data/pittsburgh-websites.json`. Audit manifests are `output/photo-expansion-oct28/approved-*.json`; exact totals are in `coverage.json`. Original website-photo records remain attributed and are not asserted to be openly licensed. The October 29 delivery layer now supplies same-origin reduced previews and browser caching; original source records remain unchanged. Rejected hijacked domains also suppress earlier remote previews. Stable provider IDs win over ambiguous name matching. After publishing, bump the public bundle revision and update exact image hosts in `vercel.json`, then restart the preview to apply its headers.

Latest October 28 correction: Living City opens on an unselected map. Map and List share every filtered venue, rendered individually with no numbered clusters. Real photos load on available pins automatically. Tapping a venue opens only that place: horizontal place switching is removed; vertical gestures dismiss or expand details. Optional filters affect both views. The custom map, private journal and 14 licensed offline photographs remain. The service worker activates a completely cached update without requiring all old tabs to close; no journal data is cleared. Live: https://boredone.vercel.app — deployment `dpl_8CV9BPRpKdmrd7g78Z8b3ebSdzC9`. 87 tests and live desktop/phone/offline checks passed; see `output/playwright/tonight-release/` and project-root `design-qa.md`. Tonight bookmarks use a separate local, 5 am-reset collection; permanent plans and journal data remain unchanged. No paid provider or scheduled crawler is enabled.

## October 27 coverage history

October 27, 2026: **624 venues within 5 km of central Pittsburgh**, including 360 restaurants, 83 bars, 33 pubs, 100 cafés and other eligible outings. **50 descriptions and 14 actual venue photos**. Explore shows the full catalog by default; With photos and Guide picks are separate views. These counts describe different evidence levels: a directory row is not an editorial recommendation, and most venues still lack a verified reusable photo.

The free pipeline now has three parts: a larger explicit OSM/OpenFreeMap snapshot, Wikivoyage editorial evidence, and a reusable Commons city photo index. The explicit snapshot builder retains up to 600 venues from the same bounded 5 km area download (64 tiles/25 MB/four concurrent requests); ordinary live area requests retain their existing 120-place limit. The public merge/cache accepts at most 800 records, still under its existing byte cap. Pittsburgh refreshes enrich with the bundled index so a live request cannot silently shrink it or replace local photos with remote ones. Saved journals and backups are unchanged.

`server/commons-photos.js` makes at most eight city/category photo searches (50 results each). It requires a reusable license, author, a bitmap file and venue-name evidence; coordinates must agree within 150 m when present. Multiple branches and known chains require coordinates. Generic names, incidental description mentions, wrong-city images and known closed-venue images are rejected. Partial upstream failures retain successful evidence. `scripts/enrich-venue-photos.mjs` offers a bounded additional pass of at most 40 exact-name searches for missing editorial photos. Photo index evidence and failures are saved alongside the output; these are explicit maintainer tools, not scheduled crawlers or browser startup requests.

An audit removed a wrong-branch Eat’n Park photo and closed Hard Rock Cafe, Double Wide Grill, Pickle Barrel and Hemingway’s records. `src/data/venue-corrections.json` records dated, source-linked exclusions (also Fuel and Fuddle for future refreshes); these only affect discovery, never existing plans/memories. This is not comprehensive current-opening verification of all 624 venues. Some source descriptions and photographs are historical.

### Rebuild commands

1. `node scripts/build-venue-guide.mjs 40.44062 -79.99589 Pittsburgh /tmp/base.json`
2. `node scripts/build-editorial-guide.mjs 40.44062 -79.99589 Pittsburgh /tmp/editorial.json` (pass radius 5000 as the final argument for the broader guide).
3. `node scripts/build-city-photo-index.mjs /tmp/base.json /tmp/editorial.json /tmp/content.json Pittsburgh`
4. Optionally `node scripts/enrich-venue-photos.mjs /tmp/base.json /tmp/content.json Pittsburgh`.
5. Review candidate identities, branch locations, photo contents, closure evidence and individual licenses before replacing the bundled JSON. Then `node scripts/cache-editorial-photos.mjs src/data/pittsburgh-editorial.json` (up to 80 images, 3 MB each), update credits and build.

For this build, Commons returned busy responses for some searches; usable evidence survived. Openverse was also investigated as a free CC-image search source, but the real API probe timed out, so no Openverse photos or integration are claimed. Its indexing does not itself verify licensing: https://docs.openverse.org/terms_of_service . Foursquare’s 500 free Pro calls do not establish free photo access: https://docs.foursquare.com/developer/reference/upcoming-changes . No account, credentials, paid calls or billing fallback were enabled. Denser photography will require additional verified open-license sources or owner/user-contributed images with permission.

### UI and acceptance

Place details are now a large photo-led sheet with a floating close control, readable title/description, known facts only and persistent Plan/Directions actions. Photo cards open details directly. The map info toggle is removed; required attribution is plain inline text. Custom map palette and bottom zoom controls remain.

72 automated tests pass and build passes with the existing bundle warning. Desktop 1440×1000, phone 390×844, narrow 360×740, all 14 photo loads, place → plan → reload → memory → offline reload with photos, and desktop memory persistence passed in an isolated browser. Source/photo audit and evidence: `output/playwright/coverage/`. Current local preview: http://127.0.0.1:4350/?preview=coverage . Not deployed.

## Previous editorial implementation (superseded coverage limits)

Updated October 27, 2026. Implemented locally, not deployed. The user's monthly API budget is zero. No paid provider, account, API key, social login, or subscription is required or enabled.

## Sources and delivery

The existing OSM/OpenFreeMap venue pipeline supplies a bounded base guide. The new `server/editorial.js` adds Wikivoyage Eat/Drink listings with actual editorial descriptions, revision URLs, retrieval timestamps and listing dates when supplied. It reads the city page plus at most eight linked districts, retains only nearby coordinates, excludes explicitly closed listings, and deduplicates records. This is an attributed guide recommendation, not a popularity or live-opening claim.

Photos come from Wikimedia Commons: explicit listing images, a listed Wikidata entity's image, or conservatively matched venue-name/coordinate results within 100 metres. Accepted images require an author, approved image host and supported reuse license. Generic neighbourhood pictures are not substituted. Each image shows its author, source, license and crop disclosure. Attribution and licensed excerpts remain attached in the cached data.

Pittsburgh includes 32 editorial listings, 29 with descriptions and three verified venue photos (Original Oyster House, Grand Concourse and Penn Brewery). The descriptions open immediately as Guide picks. All venues exposes the larger venue-only directory. Cards show source-linked descriptions; selecting a card opens the full description and existing plan/memory flow. No request is necessary to populate the default feed. Licensed bundled photos are included in the offline shell. The snapshot records a partial optional upstream failure; coverage is intentionally not represented as complete.

Explicit city changes load the base guide first, then `/api/editorial` enriches it. Source outages retain the base guide. Runtime work has a 25-second deadline, at most two concurrent city loads, bounded page/photo queries, and a 12-city/24-hour complete-result cache. In-flight requests coalesce; partial results are not cached for a full day. Other cities require an initial successful fetch; editorial/photo coverage varies by guide.

## Ranking and persistence

`src/recommendations.js` ranks editorial evidence, the user's own liked venue types and ratings, plans, distance and variety. Unknown listing age is disclosed; dated old listings receive a small penalty. No invented ratings, hours, prices, trending labels or social recommendations. Mood/time filters remain optional; time is still a distance heuristic, not travel or visit duration.

Conservative name/coordinate merging preserves existing base IDs when a unique same-venue match exists. New editorial venues receive deterministic IDs. Discovery metadata is separate from the private journal. Existing saves, backup formats and user memory photos are preserved. There is no social scraper or scheduled crawler.

## Updating the bundled guide

Run `node scripts/build-editorial-guide.mjs 40.4406 -79.9959 Pittsburgh src/data/pittsburgh-editorial.json`, then `node scripts/cache-editorial-photos.mjs src/data/pittsburgh-editorial.json`, review the source metadata/photos, and build. These are explicit refreshes, not background downloads. Photo download size is bounded to 3 MB per file and twelve files per run.

Wikivoyage excerpts are adapted plain text under CC BY-SA 4.0. Each record links to the exact page revision; individual photo licenses are in the JSON and `public/guide-photos/CREDITS.md`.

Sources: https://en.wikivoyage.org/wiki/Wikivoyage:Copyrights ; https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia ; https://www.mediawiki.org/wiki/API:Parsing_wikitext . Foursquare was researched but is not the chosen provider under the user's zero budget. Google map/storage constraints and TikTok Research eligibility also make them unsuitable as a drop-in source here.

## Verification

65 automated tests pass; production build passes with the existing chunk-size warning. Real local HTTP editorial route tested against upstream sources. Browser verification at 1440×1000 and 390×844 covers rendered photos, functional bottom zoom, recommendation → plan → reload → memory → offline reload with a loaded photo. Narrow 360×740 layout and desktop memory persistence checked separately. Isolated test profile; no normal journal edits or physical-device testing. Evidence: `output/playwright/editorial/`.

## October 27 website-photo expansion (historical)

Supersedes the early coverage figures above: 624 Pittsburgh venues, 50 editorial descriptions, **127 venues with photos online**. **116** have visually reviewed photos from their official business/brand websites; **14** have licensed bundled photos (three overlap). This remains below majority coverage. No paid API, account or key is used. Other cities do not yet receive this website enrichment.

`server/site-previews.js` reads Open Graph/Twitter image metadata, structured images and prominent page images from verified website URLs. Open Graph's sharing-image specification is at https://ogp.me/ . Public metadata is not an open reuse license: website images are attributed direct remote previews, with `license:null` and `offline:false`, never copied into the shipped offline bundle. Brand imagery is labeled when it cannot establish a particular branch interior. Broken website images fall back to a licensed photo when available. No generic stock filler or invented photo matches.

Refresh workflow:

1. `node scripts/enrich-venue-websites.mjs src/data/pittsburgh.json /tmp/venue-websites.json` resolves existing OSM node/way IDs in batches of 100. Exact normalized names and nearby coordinates must agree. Source URLs and timestamps accompany verified website metadata.
2. `node scripts/build-website-previews.mjs /tmp/venue-websites.json /tmp/website-candidates.json 700` checks robots rules and scans bounded HTML with three concurrent jobs, timeouts, size caps and resumable successful results. Public HTTPS only; DNS/IP checks and pinned connections block private-network destinations. No JavaScript, login or access-control bypass and no public arbitrary-URL proxy.
3. Audit candidates using `scripts/audit-website-images.mjs` into a temporary/output directory; review actual pixels, identity, branch, logos, placeholders and source context. Publish only reviewed matches to `src/data/pittsburgh-websites.json`, retaining IDs and source provenance. Audit downloads are not production assets. The approved URL/venue manifest is `output/playwright/websites/approved-photos.json`.
4. Add accepted image hosts explicitly to the existing `vercel.json` image CSP, run tests/build and verify loaded images under that CSP. Preserve existing licensed assets. The service worker excludes cross-origin images; regular browser HTTP caching still applies.

This run identified website URLs for 352 of 624 venues. Many sites were unreachable, blocked requests, supplied only logos/promotional graphics, or lacked usable images; others have no verified official URL. A repeated refresh can recover transient failures but cannot honestly guarantee majority coverage. The next coverage work is verified official-site discovery for missing venues and owner-provided images, with review before publication. No automatic recurring crawl is configured.

Mobile details now have a draggable handle/cover, two height states, swipe-down collapse/dismiss, Results/Map controls, previous/next places and browser Back support. Returning to results restores list position and focus. The content scrolls separately with persistent plan/directions actions. Connectivity changes update the photo filter; offline discovery keeps the licensed collection and journal.

Final rendering follow-up: photo icons remain until image decoding finishes; Tonight bookmark feedback has no transient color delay. Production response: `output/playwright/tonight-release/deploy-render-fix.txt`; focused live verification: `live-render-check.txt` and `live-render-card.png`.


## October 29 photo delivery and marker retention

Live deployment `dpl_DyKVdBwja8cfq9AYteeJGe8JACfa` keeps marker/image DOM by venue ID through zoom, pan, resize and selection. It no longer deletes decoded pictures on every map move. Pin images start eagerly and use `src/photoUrls.js` to request source-host thumbnails for 100 venues (87 unique photos); detail cards still use original images. Unknown/local/signed URLs are left intact, and thumbnail errors fall back to the original URL and licensed photo. No new image proxy, paid service or remote-photo offline bundle.

Every derived URL was verified as an actual image. Matched audit totals: 55,643,105 original bytes → 2,334,033 thumbnail bytes, 95.8% smaller for this subset. `output/playwright/photo-loading/thumbnail-size-audit.json` retains source/thumbnail URLs, dimensions and byte counts; audit copies are not shipped. Live verification retained 289/289 image nodes with zero resets/new photo requests during zoom/pan. The first download remains network-dependent. 89 tests pass.

Source-host transformations follow their primary documentation: [Squarespace Image Loader](https://commerce-apis.squarespace.com/image-loader), [Wix URL image transformation](https://dev.wix.com/docs/api-reference/assets/media/media-manager/url-image-transformation), [Imgix responsive images](https://docs.imgix.com/en-US/getting-started/tutorials/responsive-design/responsive-images-with-srcset), and [Shopify image_url](https://shopify.dev/docs/api/liquid/filters/image_url). Image identity, attribution, branch scope and licensing metadata remain on the unchanged original venue photo records.


## October 29: bundled photo delivery and persistent caching

Current production: `dpl_8CV9BPRpKdmrd7g78Z8b3ebSdzC9`, https://boredone.vercel.app . This supersedes the remote-only delivery notes above. The current guide has the same 289 photo-bearing venues, represented by 255 exact source URLs. `src/data/photo-previews.json` maps each approved original URL to a content-hashed 640 px WebP card and a cell in the 572,108-byte map-photo sheet. Both are served from `/photo-previews/` with immutable HTTP cache headers. Source credits and scope stay on the original records; no newly licensed-image or new-content claim is made.

`server/offline-shell.js` preloads and precaches the map sheet with the app. A separate `boredone-photo-previews-v1` cache stores up to 128 opened cards across releases, serializes eviction, prunes obsolete names on activation and tolerates quota/write failures. It caches only enumerated same-origin image previews, never APIs, remote tiles, error HTML or journal records. Unopened offline cards use their small map photo as a fallback. Browsers can evict storage; the cache is not an archival guarantee. Map tiles still need a connection.

Explicit rebuild: export `bundledArea(DEFAULT_AREA).places.filter(p => p.websitePhoto || p.photo).map(p => ({id:p.id,name:p.name,photo:p.websitePhoto || p.photo}))` to a local JSON file, then run `python3 scripts/build-photo-previews.py <that-file>`. The maintainer tool requires Pillow, reads already-audited original files under `output/` plus licensed `public/guide-photos/`, and fails if any exact source is missing. It does not discover, download, substitute or approve new content. It removes only unreferenced generated `.webp` files in its own output folder. Then run `npm test` and `npm run build`. Sources used this release: `output/playwright/photo-cache/sources.json`.

93 tests pass. Live 3 Mbps/80 ms uncached photo readiness: 3,300 ms; warm: 438 ms with zero photo transfer. Full browser restart while offline restored the cached map sheet and opened Tonight photo. No physical-device claim. Delivery measurements, desktop/phone captures, source coverage and deployment response: `output/playwright/photo-cache/`.


## October 29: expanded official-website photos

Added 40 reviewed photo-bearing place records, taking the unchanged 613-place guide from 289 to **329 with photos**. Restaurant/bar/pub coverage rises from 217/465 to **257/465 (55.3%)**. There are 320 website-photo records, 14 licensed-photo records (five overlap), and 433 website URLs. This is not complete coverage, and some directory records represent the same establishment; additions are not claimed as 40 unique businesses. No venues were removed to increase the percentage.

Sources include Kavsar, Alihan’s, No. 1 Sushi, Rosewater, Aruba Island Bowls, All India, Atarashi, Chaykhana, Eleven, Spirits & Tales, Luke Wholey’s, Pizza Italia, Pizza Fiesta, Fazio’s, the Terrace Room and Tap Room, and others. Used public official-site image/background/food-gallery sources, verified business identity/address, and reviewed actual pixels. Shared brand food photography is labeled. Rejected logos, promotion posters, wrong-location imagery, unrelated replacement domains, and unsupported matches. Joe & Pie’s current website listed a different Pittsburgh branch, so its food images were not assigned to the old downtown record. The Library and 412 Brewery’s unrelated replacement websites are suppressed; the venues and private saves remain. No paid APIs, accounts, social-media scraping or invented photos.

Evidence and exact source URLs: `output/photo-expansion-oct29/published-additions.json`, `selected.json`, browser/page audit manifests and contact sheets. Catalog metadata retains original attribution, source URLs, date and branch/brand scope. The image extractor now handles doubly encoded background URLs and filters font files before they crowd out photo candidates, with a regression test. Public guide revision `venue-websites-5` updates existing discovery caches without changing journal/Tonight schemas or saved IDs.

Rebuilt the delivery index from audited original bytes: 291 distinct source photos, one **661,350-byte** map sheet (up 89,242 bytes), and on-demand cards up to 640 px. Existing stable-size pins and persistent cache behavior remain. Images from business websites are not newly claimed to be openly licensed. Remaining gaps include missing or dead official sites, inaccessible pages, logo-only/promotional imagery and uncertain location matches.

Deployment: `dpl_47NEUjSSdMjViJFE3xutq6SUe52p`, READY, canonical https://boredone.vercel.app ; immutable https://boredone-de3z7lh4i-zgliv21-gmailcoms-projects.vercel.app . Existing working tree deployed, no clean commit implied.

Verification: **94 tests pass**, build passes with existing bundle-size warning, whitespace check passes. Actual canonical-site checks at 390×844 and 1440×1000 confirm 613 individual markers, 329 photo cells, no initial selection, retained nodes through zoom, newly added Pizza Fiesta card and attribution, Tonight saving, offline reload/card display, and zero page errors. Under a cold 3 Mbps/80 ms emulated connection the full pin-photo sheet was ready at 3,741 ms; warm reload at 717 ms with zero transferred photo bytes and the sheet in persistent Cache Storage. These are measured browser photo-readiness timings, not physical-device or whole-app guarantees. Desktop/phone/card screenshots reviewed. Evidence: `output/playwright/photo-expansion/` and source/build/test evidence in `output/photo-expansion-oct29/`. The local preview remains on port 4350.


## October 29: additional verified restaurant photos (live)

Added 8 photographed place records: Dancing Crab Thai (2126 E Carson), Deli on Butler (4110 Butler), Carson Street Deli (1507 E Carson), Wiener World (626 Smithfield) and four currently listed Primanti Bros. locations. Primanti food photos are explicitly labeled brand photography and the 411 Cherry Way entry was not assigned an image; the current locations list does not include it. Coverage is now **337/613 places**, including **265/465 restaurant/bar/pub records (57.0%)**, up from 329 and 257. These are records rather than necessarily unique businesses. No places were removed to inflate coverage. Source metadata and images were reviewed; official-site evidence is in `output/photo-expansion-next/`. Several outdated URLs led to wrong businesses or inaccessible content and were rejected. No paid services, accounts or invented images.

Cached image delivery remains one 670,378-byte atlas for 295 unique originals (9,028 bytes larger than before) plus on-demand content-hashed cards. Revision `venue-websites-6` refreshes the discovery bundle without modifying journal or Tonight data.

Deployment `dpl_E7y438Uhm1MNWWtMZEVCVi2WGs5o` is READY at https://boredone.vercel.app ; immutable URL https://boredone-7mw4n3gmk-zgliv21-gmailcoms-projects.vercel.app . Existing working tree deployed, no commit implied.

Verification: 94 tests pass, production build passes with existing chunk warning, whitespace check passes. Canonical site tested at 390×844 and 1440×1000: 613 individual pins, 337 photo cells, stable nodes through zoom, new Primanti brand-photo card, Tonight save and offline reload with photo; zero page errors. The new pin was selected programmatically, not via a physical tap. On a 3 Mbps/80 ms emulated connection photo readiness was 3,609 ms cold and 836 ms warm; warm sheet transferred zero bytes and was present in Cache Storage. These are observed browser measurements, not a guarantee or physical-device test. Screenshots and logs: `output/playwright/photo-expansion-next/`. Remaining 200 food/drink records lack verified photos; some are stale, closed or have no accessible official photo.


## October 29: 15317-to-Pittsburgh corridor (live)

User wants a lot more outings between ZIP 15317 and downtown, plus real photos for every place. Added a preloaded “15317 to Pittsburgh” choice under the area menu. It combines 295 OpenMapTiles/OpenStreetMap venue records from bounded 5 km snapshots centered on Southpointe, Bridgeville and the South Hills, plus 150 downtown records from the existing guide (445 total after deduplication). It is a geographically broad collection, not a route or a 5 km radius; displayed straight-line distances are from Bridgeville. Existing Pittsburgh default, saved outings and Tonight data remain intact. Listings are directory evidence, not verified recommendations or guaranteed current openings. Coverage is not exhaustive: Southpointe/McMurray and the gaps between snapshots need additional source review.

Reviewed 25 official-site food and drink photos for corridor venues; they are labeled as brand photos. The corridor has 136 photo-bearing records out of 445, including downtown records already photographed; many new venues have no verified photo. Pittsburgh guide remains 337/613 and restaurant/bar/pub 265/465; **the requested complete photo coverage is not achieved**. Audit inputs, source URLs, images and visual contact sheets: `output/corridor/`. A real photo for every record cannot be guaranteed from free public websites: missing or stale sites, inaccessible images, closures and ambiguous venue matches remain. Owner-contributed, licensed or user-supplied photos are the realistic fallback; do not invent images, count unrelated stock, or remove unphotographed places to inflate coverage.

Generated one shared 720,242-byte atlas for both areas (315 distinct sources), 49,864 bytes larger than the previous release; photos remain cached locally and fixed size during zoom. Guide revision `venue-websites-7`; no paid service or account. The corridor is selected explicitly and preserves the existing default and previously selected areas.

Deployment: `dpl_Cd4Y5Vz1RVtex4FLSm8qxnfA9ZsU`, READY, https://boredone.vercel.app ; immutable https://boredone-66ncniqjk-zgliv21-gmailcoms-projects.vercel.app . Existing working tree deployed; no commit implied.

Verification: 95 automated tests pass, including exact preview assets for both guides and corridor restoration; build passes with existing chunk-size warning. Local phone and desktop verified 445 map pins, 136 displayed photos and no replaced photo nodes on zoom. After reload and forced offline, the corridor list and an existing Tonight bookmark remained accessible; map tiles need internet. Production phone/desktop checks showed the same 445 pins/136 photos and restored the selected area after reload. Screenshots: `output/playwright/corridor/`. No physical-device test, nor complete opening-hours/venue verification.
