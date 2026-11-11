# Boredone

**Find it. Do it. Remember.** A browser-first personal outing journal with real place discovery, plans, and private memories.

This working web implementation continues the original concept preserved at `/Users/Test/Documents/Code Archive/Archive/Bordone`. The original Expo source and shared recovery site are unchanged. This directory is the maintained web source; it does not claim to fix the old native build.

## Run and check

Requires Node 22+.

```sh
npm ci
npm run dev       # http://127.0.0.1:4342, including real discovery API
npm test
npm run build
```

Vite's development middleware and the Vercel `/api/discover` function call the same server module. `npm run preview` serves the production build at `http://127.0.0.1:4343` with the same discovery and area-download API handlers. Run `npm run build` first.

## Working loop

1. Find a city in the bundled GeoNames directory, or opt into approximate device location. Select a category and 1.5, 3, or 5 km radius.
2. Choose **Find nearby places**. It checks the real directory for up to five seconds; if unavailable or slow, it automatically downloads and saves the selected neighborhood guide from real map POIs. Source dates and unknown venue facts remain visible. Browse pins/list, make a plan, and check venue details before going. These are places, not a live event/ticket feed.
3. Save a plan, set a date, add companions and notes. Manual entry supports activities or places absent from the directory.
4. Mark a plan visited, record a date/rating/note and up to six photos. Photos are resized locally to JPEG, at most 1600 px, stripping source metadata. JPEG/PNG/WebP input is accepted; HEIC/video is not.
5. Return to a dated memory timeline, inspect all photos, edit, search notes/companions, or plan another visit.
6. Export a versioned JSON file containing all outings and photos. Validated imports preview additions/updates and merge by ID, keeping the newer version. Nothing is erased wholesale.

## Storage and privacy

- IndexedDB stores the journal in this browser profile. No account, server journal storage or automatic cloud sync. This is a personal pilot, not a multi-device service.
- Each save is one atomic transaction with a revision check. Concurrent stale writes fail visibly; BroadcastChannel refreshes other tabs. Outing edit timestamps prevent overwriting a changed open editor.
- Failed writes leave the previous journal intact. Quota failures are visible. A browser storage-persistence request is optional and does not replace backups.
- Maximum 500 outings, six photos per outing, 50 MB total journal/import/export; saves that would exceed the exportable size are rejected without changing existing data. Export regularly. Notes and photos are not encrypted; someone using the browser profile can read them. The app contains no analytics.
- The discovery server rounds coordinates to 0.01 degrees before querying providers and calculating distances. This still reveals the approximate area searched. Journal content never enters a discovery request.
- MapLibre renders OpenFreeMap vector tiles and fonts on demand with an original Bordone map style. Requests reveal the viewed region/IP to OpenFreeMap. No automatic offline basemap download or tile scraping. Hide map removes the renderer and stops further requests; the place list remains usable.

## Providers, attribution and cost

No new accounts, paid keys or subscriptions are required.

- **Cities:** 34,165 records from GeoNames `cities15000.zip` with `admin1CodesASCII.txt`, downloaded October 15, 2026 (Eastern). The app retains ID, city/ascii name, region, country code, coordinates and population. GeoNames data is CC BY 4.0; attribution and license links are shown in Journal settings. This is city search, not exact address lookup. The public Nominatim API is deliberately not used.
- **Venues:** OpenStreetMap data, ODbL attribution shown in map and results. Server queries prefer the most recently successful provider (initially VK Maps), with Private.coffee as the other candidate; the actual provider is named in each response and result footer. Both are documented public Overpass instances allowing this use. Their availability is not guaranteed. On October 15 the primary returned HTTP 500 while the fallback returned 36 real Pittsburgh culture venues.
- **Map:** OpenFreeMap vector tiles, OpenMapTiles schema and OpenStreetMap geography. Provider/data attribution remains visible on the map. The custom palette, paths, building shadows and original illustrated landmarks change presentation, not geography. See `public/world/PROVENANCE.txt` for the generated artwork provenance.
- Queries are user-triggered, category/radius bounded, capped at 180 source elements / 120 displayed results, with a 12s upstream query budget and 16 MB query memory bound. The second provider starts after 1.5s if the first is slow, or immediately if it fails. One absolute 22s deadline bounds the whole search; the successful provider cancels its loser. Identical requests share work, with up to three distinct searches per process. Disconnecting the last consumer cancels the upstream work. Ordinary failures back off for 30s; HTTP 429 honors a bounded 2–5 minute Retry-After cooldown. These are personal-pilot safeguards, not distributed account-wide throttling.
- Successful exact queries cache for 30 minutes in the warm server/CDN. During an outage, a prior identical warm-process result under 24 hours old is returned explicitly stale, with the original retrieval date and no-store. Failures never refresh the age. The browser separately keeps up to 12 successful public place searches, at most 1 MB, across reloads: live searches expire after 24 hours; explicit saved map areas after 30 days. Fresh results, including downloaded guides, avoid repeated queries for 30 minutes; explicit refresh rechecks the app API. Offline searches reuse an unexpired matching saved guide immediately. Clearing saved searches is available in Journal settings and never changes journal entries.
- Searching or retrying keeps previous finds available. Their original area/category/radius and retrieval timestamp remain visible even when controls have changed. Distance and radius use the disclosed approximate rounded search center, not precise device location. A failed search is dismissible so prior places remain usable.
- **Neighborhood guides:** **Find nearby places** discloses that it saves a guide when the directory is unavailable. After a failed or five-second live attempt, the browser cancels that request and automatically downloads a bounded neighborhood of real OpenFreeMap/OpenMapTiles POIs, then saves the resulting place guide in this browser. It is labeled map-dataset information, not a live venue feed; source dataset version and unknown hours/access are explicit. The basemap itself is not downloaded. The server limits each area to 64 zoom-14 tiles and 25 MB, four concurrent provider requests globally per process, two active area jobs and a 20s deadline. The separate **Save area** shortcut downloads directly. No download happens on initial load, camera movement or a category change; only the user-requested search/save action triggers it. No automatic background area download or broad scraping occurs. This fits the provider’s documented offline-area allowance; [OpenFreeMap terms](https://openfreemap.org/tos/) still apply.
- Endpoints can be changed without a client release through server environment values `BOREDONE_OVERPASS_URL`, `BOREDONE_OVERPASS_NAME`, `BOREDONE_OVERPASS_HOME`. No arbitrary endpoint is accepted from a browser request.
- Vercel usage belongs to the owner's existing account. Provider APIs add no paid subscription. Production scale would need reliable contracted data, distributed throttling and cost monitoring.

Policies checked: https://overpass.private.coffee/ · https://wiki.openstreetmap.org/wiki/Overpass_API · https://openfreemap.org/quick_start/ · https://openfreemap.org/ · https://operations.osmfoundation.org/policies/nominatim/ · https://www.geonames.org/export/ · https://www.openstreetmap.org/copyright

## Pilot limitations / next work

- No live events/tickets, reservations, notifications, social sharing, account sync or video uploads.
- OpenStreetMap coverage/hours vary. Always confirm with the venue. Distance is straight-line from the approximate search center, not a route.
- City directory covers settlements around 15k people and above. Use a nearby city or approximate location for smaller places.
- Public Overpass providers may fail or take tens of seconds. Failures remain explicit and do not block local planning/memories.
- A user trial should validate whether venue discovery plus personal memories supports a repeat habit before adding more providers or social features.

## Portfolio walkthrough (October 23, 2026)

Discovery now opens into an illustrated neighborhood world: a custom MapLibre basemap, original garden/café/gallery/arcade landmarks, folding place list, mood dock, place inspector, and map collections for plans and memories. The map uses real geography. Dense results group into clickable counts; selecting a group opens its places and zooms, and selecting a place keeps its marker visible. Repeated visits share a single pin; manual entries without coordinates remain accessible in the list.

“Pick for me” suggests an alternative, preferring unvisited places. Field notes collect stamps for unique places actually marked visited; plans and repeat visits do not inflate the count. There are no streaks, synthetic achievement totals, or claims of verified attendance. The same plan → visit → memory workflow still owns the journal. Keyboard-accessible map buttons have matching list controls, reduced-motion preferences are respected, and map/WebGL failure opens a usable list.

Use **Explore a sample neighborhood** for a reliable product walkthrough when the public venue providers are unavailable. Sample venues are explicitly fictional, based around a Pittsburgh map viewport, and never real recommendations. The demo supports planning, visiting, notes, ratings, and memories in separate in-memory state. Leaving or reloading discards it; the real IndexedDB journal is untouched. Journal import/export is unavailable inside the demo. Base map tiles still require network access, but the sample places, local artwork, planning and journal walkthrough remain usable in the list when the map cannot load.

During October 23 verification, real venue discovery returned HTTP 503 from the upstream provider chain after about 29 seconds. A separate direct VK probe returned 23 real venues after about 23 seconds while the primary timed out: live availability is intermittent, not fixed. The tested cache/provider fallback only improves requests when a provider succeeds or a matching warm cache exists. The error is surfaced, and manual planning plus the sample walkthrough remain usable. This is still a local-first personal pilot with no accounts, live-event inventory, route optimization, or cross-device sync.

Round-two evidence and verification: `output/portfolio-upgrade-oct23-round2/handoff.json`. Screenshots are under `output/playwright/portfolio-upgrade-oct23-round2/`. MapLibre adds a substantial initial bundle (about 359 kB gzip plus a 519 kB worker before compression); splitting/loading optimization remains future work.

## Live discovery reliability pass (round three)

The app endpoint returned 21 real Pittsburgh culture venues within a 1.5 km approximate radius on October 23, including Pittsburgh Playhouse, Benedum Center, Heinz Hall and Wood Street Galleries, in 19.2 seconds. Other probes timed out or returned 504/406; this demonstrates a working live path, not guaranteed public uptime. The explicit **Save area** download offers actual map places during Overpass outages, with weaker metadata clearly labeled. Evidence and verification are recorded in `output/portfolio-upgrade-oct23-round3/handoff.json`.

The production build includes a versioned service worker for the public app shell, local artwork and bundled city directory. After one successful online installation, it supports reopening saved places and the journal offline. It never intercepts `/api/`, external map tiles or private journal storage. App-shell updates activate after the complete new shell is cached; a failed install leaves normal online use intact. Browser cache eviction can still remove offline assets.


## October 26 usability and global discovery pass

- Scroll and trackpad pinch zoom are enabled without a modifier requirement. Place sheets scroll independently. Camera fitting happens only when the actual geographic collection changes; refreshing the same places or editing a journal entry preserves the camera.
- A user-requested search now automatically saves a real neighborhood guide if the live directory fails or takes more than five seconds. The area download has a separate twenty-second limit; cancellation stops the old work and never starts another download. Both failures leave previous results and their original area visible, with a dismissible corner notice and manual entry.
- On October 26, the same ordinary search flow returned real London culture places (120, 5.90s), Tokyo food places (120, 7.01s), and Sydney outdoor places (89, 7.41s). All used the October 18 map dataset after the live directory exceeded five seconds. These are bounded nearby results, not exhaustive inventories or promises of current opening hours.
- Geography and venue discovery are global coordinate/category queries, not handmade per-city content. Pittsburgh is only the initial city; four opt-in fictional sample venues support a separate practice world. Category artwork is decorative and does not depict each venue’s building.
- The next product layer is activity relevance: events with dates and availability, duration/budget/accessibility filters, explanations for recommendations, and reliable venue enrichment. A durable worldwide event/venue index would need licensed or permitted sources, ingestion/update jobs, stable cross-source identities, deduplication and measured freshness. The current engine is useful nearby-place discovery and a local outing journal; it is not that complete event index.

Evidence: `output/portfolio-upgrade-oct26/`; browser screenshots: `output/playwright/oct26/`. Gesture checks use synthetic wheel and Ctrl-wheel events in Chromium; a physical Mac trackpad has not been tested by the agent.


## October 29 photo delivery

All 289 photographed venues now share one 572 KB map-photo sheet served by Bordone, with compact card previews loaded on demand. The map sheet persists with the offline app; up to 128 opened cards persist across reloads, browser restarts and app releases. Source attribution stays visible. No paid image API is needed. Browsers can clear/evict these caches; map tiles still need internet. See `docs/DISCOVERY_ENGINE.md` for the explicit preview rebuild and verification evidence.

### Private beta account preparation

Accounts are disabled unless both `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are configured. Only a publishable browser key is accepted. The guest journal and its v1 exports continue to work without configuration; no device saves are automatically uploaded.

The dedicated Free Bordone organization and project were created November 9; all three journal migrations and the private photo bucket are installed and hosted protocol checks pass. Google OAuth and the production account environment are still unconfigured. Before enabling accounts, finish Google setup, admit the intended beta accounts and verify the real browser sign-in/restore flow. Google client secrets belong only in provider settings. Verify the exact app return URL `https://boredone.vercel.app/?auth=callback#settings` and allow only the new project origin in `vercel.json`'s `connect-src`. Current production CSP does not allow arbitrary Supabase projects.

Prepared account journals can reopen their existing device copy while a remembered session refreshes, including offline with an expired token. This is local cache recovery, not authenticated cloud access. Explicit sign-out closes every open tab’s account view and blocks automatic recovery until a new sign-in; cached photos remain available for a later sign-in to the same account.

Account removal is prepared in settings with typed confirmation, export, durable progress/retry and account-specific device cleanup after confirmed server completion. `/api/account-removal` fails closed without server-only `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`; never expose the secret as a `VITE_` variable. Apply all journal migrations, including the removal coordinator, and verify hosted deletion before enabling accounts. Unfinished drafts are not included in exports; the confirmation explains this. Guest saves and other accounts remain intact.

The account UI/transport tests currently include explicit server fixtures; they are not proof of hosted privacy or reliable phone/laptop backup. See the latest entry in [the existing project handoff](docs/PITTSBURGH_EXPLORATION.md) for deployed state, evidence and remaining launch gates. Account exports use v2 with deduplicated photos (80 MiB JSON cap); account imports also accept guest v1. Guest formats/limits are unchanged.


### Finish Google sign-in (November 9 setup)

The existing CLI login manages the new **Bordone** organization (`witubbnogpljfjvgnhao`) and **boredone** project (`gpptgcdhgdbznzlwnxel`, us-east-1). No new Supabase organization or paid upgrade is needed. The Supabase connector is still scoped to Parl.ai; use the linked CLI for Bordone until that connector grant is expanded. Do not modify Parl.ai or ushop.

1. In [Google Auth Platform](https://console.cloud.google.com/auth/clients/create), select/create a separate Bordone project. Configure app name Bordone, the owner's support/contact email, External audience and Testing for the private beta. Add the intended Google test users. Request only `openid`, email and profile. No Maps API or billing upgrade is needed for this sign-in setup.
2. Create a **Web application** OAuth client. Authorized JavaScript origin: `https://boredone.vercel.app`. Authorized redirect URI: `https://gpptgcdhgdbznzlwnxel.supabase.co/auth/v1/callback`.
3. Enter the client ID and client secret directly into [Bordone's Google provider settings](https://supabase.com/dashboard/project/gpptgcdhgdbznzlwnxel/auth/providers?provider=Google), enable Google and save. Do not paste the secret into chat or commit it. These credentials belong in Supabase provider settings, not the frontend.
4. Set Supabase Auth Site URL to `https://boredone.vercel.app` and allow the app return URL `https://boredone.vercel.app/?auth=callback#settings`. Do not confuse this app return with Google's Supabase callback above. These Auth URL settings still need to be applied/verified.
5. Builder: configure the exact Supabase CSP origin, browser publishable configuration and server-only removal credentials on Vercel; inspect the resulting deployed configuration. Finish actual Google sign-in, explicit beta admission, opt-in guest import, two-account isolation, phone/laptop restore, offline/reconnect and interrupted upload/removal checks before opening the beta. Accounts remain disabled until ready.

Private setup credentials are stored only in the ignored, mode-0600 `.env.supabase-setup.local` file. `.env*` is also excluded from Vercel uploads. Never display its contents or expose `SUPABASE_SECRET_KEY` through a `VITE_` variable. Reference: [Supabase's Google setup guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).
