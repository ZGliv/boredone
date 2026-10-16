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

Vite's development middleware and the Vercel `/api/discover` function call the same server module. `npm run preview` serves static assets only; use the dev server or a Vercel deployment for discovery.

## Working loop

1. Find a city in the bundled GeoNames directory, or opt into approximate device location. Select a category and 1.5, 3, or 5 km radius.
2. Explicitly search real OpenStreetMap venues. Browse pins/list, provenance, recorded hours/access information and venue links. These are places, not a live event/ticket feed.
3. Save a plan, set a date, add companions and notes. Manual entry supports activities or places absent from the directory.
4. Mark a plan visited, record a date/rating/note and up to six photos. Photos are resized locally to JPEG, at most 1600 px, stripping source metadata. JPEG/PNG/WebP input is accepted; HEIC/video is not.
5. Return to a dated memory timeline, inspect all photos, edit, search notes/companions, or plan another visit.
6. Export a versioned JSON file containing all outings and photos. Validated imports preview additions/updates and merge by ID, keeping the newer version. Nothing is erased wholesale.

## Storage and privacy

- IndexedDB stores the journal in this browser profile. No account, server journal storage or automatic cloud sync. This is a personal pilot, not a multi-device service.
- Each save is one atomic transaction with a revision check. Concurrent stale writes fail visibly; BroadcastChannel refreshes other tabs. Outing edit timestamps prevent overwriting a changed open editor.
- Failed writes leave the previous journal intact. Quota failures are visible. A browser storage-persistence request is optional and does not replace backups.
- Maximum 500 outings, six photos per outing, 50 MB total journal/import/export; saves that would exceed the exportable size are rejected without changing existing data. Export regularly. Notes and photos are not encrypted; someone using the browser profile can read them. The app contains no analytics.
- Discovery rounds coordinates to 0.01 degrees before sending them to the server. This still reveals the approximate area searched. Journal content never enters a discovery request.
- Leaflet uses OSM tiles on demand. Tile requests reveal the viewed region/IP to OSM. No tile scraping, prefetching or offline download. Hide map stops further tile loading.

## Providers, attribution and cost

No new accounts, paid keys or subscriptions are required.

- **Cities:** 34,165 records from GeoNames `cities15000.zip` with `admin1CodesASCII.txt`, downloaded October 15, 2026 (Eastern). The app retains ID, city/ascii name, region, country code, coordinates and population. GeoNames data is CC BY 4.0; attribution and license links are shown in Journal settings. This is city search, not exact address lookup. The public Nominatim API is deliberately not used.
- **Venues:** OpenStreetMap data, ODbL attribution shown in map and results. Server queries go to Private.coffee with VK Maps as fallback; the actual provider is named in each response and result footer. Both are documented public Overpass instances allowing this use. Their availability is not guaranteed. On October 15 the primary returned HTTP 500 while the fallback returned 36 real Pittsburgh culture venues.
- Queries are user-triggered, category/radius bounded, capped at 180 source elements / 120 displayed results, use a 25s upstream query timeout, a 16 MB query memory bound, and identify the app in User-Agent. Searches cache for 30 minutes in each warm process and in Vercel CDN. Identical in-flight requests are deduplicated; four concurrent searches per process are allowed; failed providers back off for two minutes. These are pilot safeguards, not an account-wide distributed rate limiter.
- Endpoints can be changed without a client release through server environment values `BOREDONE_OVERPASS_URL`, `BOREDONE_OVERPASS_NAME`, `BOREDONE_OVERPASS_HOME`. No arbitrary endpoint is accepted from a browser request.
- Vercel usage belongs to the owner's existing account. Provider APIs add no paid subscription. Production scale would need reliable contracted data, distributed throttling and cost monitoring.

Policies checked: https://overpass.private.coffee/ · https://wiki.openstreetmap.org/wiki/Overpass_API · https://operations.osmfoundation.org/policies/tiles/ · https://operations.osmfoundation.org/policies/nominatim/ · https://www.geonames.org/export/ · https://www.openstreetmap.org/copyright

## Pilot limitations / next work

- No live events/tickets, reservations, notifications, social sharing, account sync or video uploads.
- OpenStreetMap coverage/hours vary. Always confirm with the venue. Distance is straight-line from the approximate search center, not a route.
- City directory covers settlements around 15k people and above. Use a nearby city or approximate location for smaller places.
- Public Overpass providers may fail or take tens of seconds. Failures remain explicit and do not block local planning/memories.
- A user trial should validate whether venue discovery plus personal memories supports a repeat habit before adding more providers or social features.
