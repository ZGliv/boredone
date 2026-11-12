# Boredone: from personal prototype to App Store

Written 11 November 2026. This is the forward plan. Where it conflicts with older handoff notes (`Project Room/docs/project-plans/BORDONE.md`, `docs/PITTSBURGH_EXPLORATION.md`), this file wins — three standing rules change, listed in section 3.

Figures marked *(check)* came from third-party pages during research and should be confirmed before money depends on them.

## Status — 11 November 2026, end of Wave 1

App Store packaging is deferred until the product is good (Zack, 11 Nov). A "complete this city" game is now a core feature, built as honest progress and finishable sets with no XP, streaks or leaderboards.

**Built, reviewed, merged to `main`, 469 tests passing. None of it is on screen yet and nothing is deployed.**

| Piece | Where | What it does |
|---|---|---|
| App split | `src/app/`, `src/pages/` | `main.jsx` went from 884 lines to 15; screens can now be changed independently |
| Saves ("the Pile") | `src/saves.js`, `src/model.js`, new migration in `supabase/migrations/` | A save is an outing with status `saved`; syncs through the existing engine. **The migration is not applied to the hosted database yet** |
| Resolver | `src/saveSource.js`, `src/saveMatch.js`, `server/resolve-save.js` | Link + text → venue candidates → match against the city's places. Never fetches social sites. Needs `ANTHROPIC_API_KEY` |
| Tonight's Three | `src/decide.js` | Three picks with truthful reasons; saves first; "tonight" runs to 5 am |
| City packs | `scripts/city-pack/`, `data/city-packs/` | Any city from Overture Maps open data in about 20–40 s. Built: Pittsburgh 5 km (1,622 places), Pittsburgh metro 20 km (5,016), Columbus (2,386) |
| Events | `server/events/` | Ticketmaster, iCal and website event markup. Needs `TICKETMASTER_API_KEY` |
| City board | `src/cityBoard.js` | Progress per city, neighbourhood and kind; finishable sets; milestones; survives venue closures and data updates |
| Whole-loop test | `test/integration-loop.test.js` | Save → resolve → decide → done → board, on real Pittsburgh data |

**Known limits, stated plainly**

- Events cover maybe 10–25% of a real Pittsburgh Friday, nearly all of it Ticketmaster's big venues. Bar trivia, DJ nights, pop-ups and markets are not in any feed. The user's own saves are the better source for those, which is the point of the product.
- The open place data has some duplicates and a few non-venues (promoters, a radio station), and 19% of old-guide venues still do not pair with a pack record by name.
- With no saves and no location, Tonight's Three is close to "nearest places". It gets good when the Pile has things in it.
- The resolve endpoint's abuse protection is basic (per-server throttle). It needs sign-in in front of it before public use.

**Next: Wave 2, the screens** — Pile, "Is this the place?" card, Tonight's Three, City Board — in the design direction Zack picks from `output/design-wave1/`.

---

## 1. The honest starting point

**The original idea:** "I see fun things on social media all week. Friday night comes and I don't know what to do."

**What got built:** a hand-curated map of about 600 Pittsburgh restaurants and bars with photo pins, plus a private journal of plans and memories. It is well made — 209 passing tests, a careful sync engine, a good-looking map. But it does not touch the original problem:

| The problem needs | In the app today |
|---|---|
| A way to save a thing you saw on Instagram or TikTok | Nothing. No link saving, no share button, no paste box |
| Knowing what is on tonight (shows, pop-ups, events) | Nothing. "Tonight" is a bookmark list that empties at 5 am |
| A decision on Friday at 6 pm | "Pick for me" style ranking by distance and your past ratings |
| Any city | Search works anywhere, but only Pittsburgh has photos or descriptions |

Most of the last three weeks went into two things: hand-sourcing venue photos from restaurant websites (about 70 deploys) and building account sync that has never been switched on in production. Neither moves the Friday-night problem.

**What is worth keeping:** the data model, the sync engine and database rules, the ranking code, the visual identity, and the journal. The journal turns out to be the piece competitors lack (section 2).

## 2. The product

### One sentence

**Boredone turns the pile of things you saved into a decision for tonight.**

### Why that and not "save places from TikTok"

Saving a place from a Reel is now a commodity. Corner has raised $7.5M and reports 250k users doing exactly that; there are a dozen clones (Atly, Roamy, Maplet, GeoTok, Pintra); and Google Maps, Instagram and TikTok each do a version for free. A venue map is a commodity too.

What none of them do: take **your own saves**, cross them with **what is actually open or happening tonight**, **how far it is**, **who you are with** and **what you thought last time**, and hand you three options. Save apps answer "where was that place?" Event apps answer "what's on?" Nobody answers "what should *we* do *tonight*?" That is the product. Saving is the way in, not the pitch.

### The loop

**Save it → Decide tonight → Do it → Remember it → better picks next time.**

The last three steps exist. The first two are the work.

### Features, in priority order

1. **The Pile.** Everything you have saved, from anywhere: share sheet, pasted link, screenshot, or typed note ("that ramen place Sam mentioned"). A save does not need to be a known venue yet.
2. **"Is this the place?"** After a save, the app works out which venue or event the post was about and shows one confirm card. One tap, done. If it cannot tell, the save stays in the Pile as a note — never lost.
3. **Tonight's Three.** The home screen on a Friday evening: three options, drawn first from your Pile, each with a one-line reason ("saved 3 weeks ago · 12 min away · you loved their sister bar"). Dials for who's coming, energy (lazy ↔ up for anything) and budget. "Three more" reshuffles. This replaces the current Tonight bookmark list.
4. **Things with a clock.** Saves that expire — a pop-up that closes Sunday, a show on the 22nd — float to the top before they are gone. This is the thing a plain map cannot do.
5. **Friday nudge.** One notification, Friday around 4 pm: "3 ideas for tonight." Tapping opens Tonight's Three. No other notifications.
6. **Send it to them.** Share Tonight's Three as a link. The other person taps the one they want; no account, no install. Ends the "I don't know, what do you want to do?" loop.
7. **Done.** Marking something done moves it to the journal that already exists. Bored → done is the name.
8. **Home-screen widget:** tonight's top pick. Cheap to build once native, and it helps with App Review (section 6).

Explicitly **not** building: public profiles, followers, feeds, reviews, XP or streaks, venue advertising. Private by default stays.

## 3. Decisions made in this plan

### Standing rules that change

| Old rule | New rule | Why |
|---|---|---|
| "Memories are the foundation" (Nov 3) | The decision is the foundation; memories are the feedback loop | The journal is valuable because it makes tonight's picks better, not as a standalone diary |
| "Pittsburgh first, no other-city work" (Nov 3, Nov 5) | Pittsburgh first *for testing*, but every new piece is built city-agnostic | An App Store reviewer in California must see a working app |
| "$0 monthly API budget" (Oct 27) | Small, capped budget: about $99/year Apple fee now, and roughly $20–30/month at 1,000 users *(estimate)* | The save-resolver needs a language model, and the App Store needs a developer account. Set spending alerts before any key goes live |

Rules that **stay**: map opens with nothing selected, no numbered clusters, no carousel, swipe-down to dismiss, dark by default, no invented hours/ratings/photos, private by default, closed venues hidden but saved records never deleted.

### Technical route: wrap the existing app, add native pieces

The two options were (a) **Capacitor** — a tool that packages the existing web app inside a native iOS shell so it can go on the App Store — or (b) rebuilding every screen in React Native. The code audit leaned rebuild; the App Store research leaned wrap.

**Decision: Capacitor 8, plus real native code for the share sheet, notifications and widget.** A rebuild is several weeks before anything new reaches you, and the current UI is good. The risk with wrapping is Apple rejecting it as "just a website" (guideline 4.2); the defence is that the app's central feature — Share → Boredone from Instagram — is native and visible in the first minute.

**The gate that could overturn this:** the app has never run on a physical phone. Day one of native work is putting it on your iPhone and zooming the map with 600 photo pins. If it stutters, the fix is to draw the pins as part of the map itself (GPU-drawn) instead of as 600 separate page elements — about a two-day change. Only if that also fails does a rebuild come back on the table.

### Venue and event data

- **Places:** stop depending on free public OpenStreetMap query servers (no guarantee, no rate limit). Load **Overture Maps + Foursquare Open Places** — two free, openly licensed worldwide datasets, updated monthly, that include open/closed status — into the existing Supabase database, one city at a time, the first time someone opens that city.
- **Hours / open now:** Google Place Details, called only when a user opens a place they saved. 10,000 free calls a month. Google's terms forbid storing the results, so keep only the place ID.
- **Events:** Ticketmaster's Discovery API (free, 5,000 calls/day) first; SeatGeek second; local calendar feeds (many Pittsburgh venues publish iCal) third. Eventbrite's public search no longer exists.
- **Map tiles:** fine on OpenFreeMap for now; move to self-hosted Protomaps (about $2/month) before launch so there is no dependency on a free service with no uptime promise.

### Photos — the uncomfortable one

About 320 of the photo pins are images taken from restaurant websites and copied onto Boredone's own server, with no licence. For a personal tool, nobody cares. In a commercial App Store app it is copying, the legal protection platforms rely on does not cover photos your own scraper collected, and it is an easy takedown letter. This is the practical industry picture, not legal advice.

**Decision: the App Store build ships without scraped website photos.** Pins use, in order: your own photo of the place, an openly licensed photo (the 14 Wikimedia ones), then the category symbol. The personal web version at boredone.vercel.app can stay as it is. This will make the public map plainer than the one you like — that is the real cost, and it is why Tonight's Three, not the map, becomes the home screen for new users. No more hours go into sourcing website photos.

### Name

Three spellings are in the code (Boredone, Bordone, "Board Done"). **Use Boredone, tagline "Bored? Done."** Needs an App Store name and trademark search before submission.

## 4. Do these first (tonight)

**1. Back the code up. This is urgent.** The repository has one commit and no remote. About 95 files — the sync engine, the database migrations, the venue data, most tests — exist only on this laptop. One dead disk loses the product. It also blocks every parallel agent, because agents need a committed baseline to branch from. Commit everything, create a private GitHub repo, push.

**2. Things only Zack can do** (each one unblocks agents; none takes more than 20 minutes):

| Task | Why now |
|---|---|
| Enrol in the Apple Developer Program ($99/year) | Approval can take a day or two; nothing reaches a real iPhone or TestFlight without it |
| Create the Google sign-in client (steps are in README, "Finish Google sign-in") | Cloud sync has been finished and switched off for two weeks waiting on this |
| Get a free Ticketmaster developer key | Events work is built against recorded samples but needs a key to go live |
| Get an Anthropic API key, with a $10 monthly cap | The save-resolver calls a small model |
| Say yes or no to the three rule changes in section 3 and the photo decision | Agents should not build on assumptions you have not agreed to |

## 5. Phases

Time estimates assume heavy agent help and you reviewing in the evenings. They are estimates, not promises. **This is a six-to-eight-week build to a public listing** — the usable-by-you version arrives at the end of week one.

### Phase 1 — It works for me in Pittsburgh (week 1)

Goal: on Friday 20 November you save three Reels during the week and the app tells you what to do that night.

- Saves stored as a new status on the existing journal record (see work order B) so they sync for free.
- Paste-a-link box, plus an **iOS Shortcut** that puts "Save to Boredone" in the iPhone share sheet today, months before any App Store build. A Shortcut is a small automation you install from a link; it can receive the shared post and send it to the app's server. It also answers an open research question at zero cost: exactly what Instagram and TikTok hand over when you share (expect a link only, no caption).
- Resolver: link plus any text → small language model extracts venue name and city → match against the place list → confirm card.
- Tonight's Three screen.
- Google sign-in finished and sync switched on, so phone and laptop agree.

Exit test: you use it three Fridays running, and it picks somewhere you actually go at least twice.

### Phase 2 — Native shell (weeks 2–3)

- Capacitor project; app runs on your iPhone; map performance gate passed.
- Native Swift share extension (replaces the Shortcut).
- Sign in with Apple (required by Apple once Google sign-in is offered).
- Friday notification; home-screen widget; notch and home-bar spacing; native dialogs.
- TestFlight (Apple's beta channel) to you and about ten Pittsburgh friends.

### Phase 3 — Any city (weeks 3–5)

- City packs from Overture + Foursquare Open Places, built on first visit.
- Remove everything hard-coded to Pittsburgh.
- Ticketmaster and SeatGeek events; expiring saves.
- Store build without scraped photos; own tiles.
- Test in three cities you do not live in. If Tonight's Three is poor with an empty Pile, fix onboarding ("save five things to start") before going further.

### Phase 4 — Submission (weeks 5–7)

- Privacy policy, support page, privacy labels, account deletion reachable in-app (already built), browsing allowed without an account.
- Review notes that walk the reviewer through sharing a sample link, with a demo account.
- Screenshots, age rating (expect 13+ or higher because of bars), name check.
- Plan for one rejection round. Start Google Play's 14-day, 12-tester closed test at the start of this phase if Android is wanted; it is roughly two extra days of work with Capacitor.

### Phase 5 — After launch

Send-it-to-them links, ticket affiliate links (Fever pays 6–10% *(check)*), and a Pro tier around $30–40/year only if people are using Tonight's Three weekly. Do not build any of this before launch.

### What decides whether this is working

One number: **outings per week that started in the app.** Not installs, not saves.

## 6. Risks

1. **Apple rejects it as a web wrapper (4.2).** Mitigation: share extension, notification and widget are native and central; review notes point at them.
2. **Instagram hands over only a link.** Likely. Meta's embed service forbids using post data for anything but embedding, and scraping breaks their terms. So the resolver must work from what the user provides: shared text if any, a screenshot read on the phone, or a three-word note. Design the confirm card for that from the start.
3. **Empty-Pile problem.** A new user in a new city has no saves and no photo-rich map. Tonight's Three must still be decent from city data and events alone.
4. **The map stutters on a real phone.** Gate in phase 2, known fix.
5. **Drift.** This project has already drifted once into polish. Each week ask: did this change make Friday's decision better?

## 7. Using the agents

### What limits speed

Not tokens. Three things: (1) `src/main.jsx` is one 884-line component that every UI change touches, so only one agent can work on screens at a time until it is split; (2) the five tasks only you can do; (3) your time to review. Beyond about eight parallel tracks tonight, extra agents produce merge conflicts, not progress.

### Who does what

- **Codex (expires tomorrow — spend it tonight):** well-specified, self-contained modules that land in new files with tests. It built this codebase and follows its conventions. Work orders A–G below.
- **Claude Fable (this session):** design-heavy and judgment work — the three new screens, the Swift share extension, wiring modules into the UI, App Store submission — and reviewing every Codex branch before merge. A different model reviewing is a real check, not ceremony.
- **Claude Opus sub-agents:** the Capacitor spike, verification research, second-opinion code review.

### Rules for every work order

- Branch from the baseline commit on `main`; one branch per order; do not deploy; do not commit secrets; keys come from environment variables.
- Touch only the files listed. **Do not edit `src/main.jsx`, `src/ExploreWorld.jsx` or any `.css` file** unless the order says so.
- `npm test` passes, new logic has tests, `npm run build` passes.
- No calls to paid services in tests — use recorded sample responses.
- Respect the design rules that stay (section 3).

### Wave 1 — tonight, in parallel

**A. Split `main.jsx` (sole owner of that file).**
Break the 884-line `App` component into page modules (`src/pages/Find.jsx`, `Plans.jsx`, `Memories.jsx`, `Settings.jsx`) and a small state hook, with no behaviour change. Delete the unreachable branches (line 215 ternary, lines 568–697) and the unused `leaflet` dependency. Done when: all tests pass, and a browser run at 390×844 and 1440×1000 completes find → plan → memory → reload identically to production.

**B. Saves in the data model.**
Add `status: "saved"` to the outing record in `src/model.js`, with `place` allowed to be empty and a new `source` field `{url, app, text, savedAt, eventDate, expiresAt}`. Check the database functions in `supabase/migrations/` accept the new status; if not, add a migration. Update `storage.js`, `accountStorage.js`, backup import/export and `memoryFilters.js` so saves never appear as plans or memories. Reusing the existing record means sync, conflict handling and account deletion cover saves with no new engine. Done when: old backups still import, and new tests cover save → resolve → plan → visited.

**C. Save resolver.**
New `server/resolve-save.js` and `api/resolve-save.js`. Input: a URL and optional text. Steps: identify the source app from the URL; ask a small Claude model (model ID from an env var) for `{name, city, kind, eventDate}` candidates from whatever text exists; fuzzy-match names against a supplied place list by name and distance; return up to three candidates with a confidence score, or "unresolved". Never fetch Instagram or TikTok pages. Done when: 30 sample cases pass with the model mocked, including link-only, caption-only, misspelt names, chains with several branches, and events.

**D. Tonight's Three engine.**
New `src/decide.js`, pure logic with tests, building on `recommendations.js` and `shortlist.js`. Input: saves, places, events, past ratings, and context `{time, location, companions, energy, budget}`. Output: three picks with a plain-English reason each, saves first, expiring items boosted, nothing repeated on reshuffle until the pool is exhausted, and a sensible result when there are zero saves. Unknown opening hours are never guessed.

**E. City packs.**
New `scripts/city-pack/`. Given a city centre and radius, pull going-out venues from Overture Maps and Foursquare Open Places, drop closed and low-confidence records, merge duplicates, map categories onto `src/venues.js`, keep licence and source per record, and write the same place shape the app already uses. Build Pittsburgh and Columbus; report how the Pittsburgh result compares with the current 597-place guide (missing, extra, closed).

**F. Events.**
New `server/events/`: a Ticketmaster Discovery adapter, an iCal feed parser and a reader for event markup on venue websites, all producing one event shape `{id, title, venueName, lat, lng, start, end, url, source}` and linking to a known place when names and coordinates agree. Recorded sample responses for tests; key from env.

**G. Photo licence manifest.**
Script that lists every bundled photo with its source and a licence class (own / open licence / website, no licence), and reports what the map looks like with only the first two. No app changes.

**H. Capacitor spike (Claude Opus, own branch).**
Add the iOS project, make API calls use a full server address, add the cross-origin headers the server functions lack, fix notch and home-bar spacing, run it in the iOS simulator and screenshot the map, a place card and the journal. Write down everything that broke.

### Wave 2 — after Wave 1 merges (this week)

Single writer on screens, in this order: Pile screen and paste box → confirm card → Tonight's Three screen → Shortcut endpoint → switch on sign-in and sync. Then the Swift share extension on top of H.

### Wave 3 onward

Follows phases 2–4. Re-plan at the end of each week against the one number in section 5.
