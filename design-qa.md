# October 29 persistent photos and first-visit performance

**Final result: passed.** Performance refinement of the selected Living City interface. Production: https://boredone.vercel.app , deployment `dpl_8CV9BPRpKdmrd7g78Z8b3ebSdzC9`.

- Visual craft/identity: reviewed `output/playwright/photo-cache/live-desktop.png`, `live-phone.png`, `live-card.png` at 1440×1000 and 390×844. Same cream/forest map, individual real-photo pins, serif titles, bottom zoom controls and uncluttered card. Compact previews preserve readable photo detail at the displayed sizes.
- Primary task: app still opens with all 613 venues, 289 photos, no selection/clusters. Tap → card → Tonight → offline reopen passes. No navigation, swipe behavior or journal schema change.
- Interaction/performance: stable pin cells survive zoom. A live cold run at 3 Mbps/80 ms reached all photo pins in 3,300 ms using one 572 KB resource; warm return took 438 ms and no photo transfer. First visit no longer depends on restaurant websites. Map tile latency remains external.
- Durability: fully closing/reopening the persistent test browser while offline restored Tonight's card and the cached photo sheet. Unopened offline cards can use their map-photo preview. Cache capacity and quota failure behavior covered by tests. 93 tests pass; build passes with existing size warning.
- No physical-device or universal timing claim. Screenshots establish appearance; the recorded browser/Cache Storage checks establish caching and interactions. Existing saves and attribution preserved. No invented imagery or added paid service.

---

# October 29 photo-loading follow-up

**Final result: passed.** This is a lifecycle/performance correction to the approved interface, not a new visual direction. Production: https://boredone.vercel.app , deployment `dpl_DyKVdBwja8cfq9AYteeJGe8JACfa`.

- Confirmed flicker cause: before the fix a zoom cycle retained zero photo elements. The live after-check retains all 289 decoded images and all 613 markers through zoom/pan, with zero resets or new photo requests. Photos, selected styling and category fallback remain consistent instead of cycling during motion.
- Thumbnails preserve the same real source images and credits. 87 optimized URLs validated; 100 venues use them. Detail imagery stays full size. No generic replacements or new imagery were introduced.
- Actual captures: `output/playwright/photo-loading/live-phone.png` (390×844) and `live-desktop.png` (1440×1000), density 1. Existing cream/forest map, typography, card hierarchy, individual venues and selection behavior remain. These are functional screenshots, not substitutes for the recorded DOM/network checks.
- Live selection/bookmark persistence and offline Tonight reopening pass, with no page exceptions. 89 automated tests pass; build passes with existing size warning. Native pinch result is recorded separately in `live-pinch.txt`; no physical-device testing.
- Cold startup still needs initial network transfers. No all-network instant-load guarantee, paid service or altered journal/offline-photo licensing behavior.

---

# October 28 production follow-up: individual photo pins and one-place cards

**Final result: passed.** Latest user instructions supersede earlier cluster and carousel designs below. Do not treat those historical captures as current behavioral requirements.

Current implementation: https://boredone.vercel.app , deployment `dpl_GbQwKKhzybEtjDmC5DY4KMruc1DT`. Evidence: `output/playwright/tonight-release/live-phone-map.png`, `live-photo-pins.png`, `live-phone-card.png`, `live-phone-expanded.png`, `live-phone-tonight.png`, `live-desktop-map.png`, `live-narrow-map.png`. Captured at 390×844, 1440×1000 and 360×740 CSS pixels, density 1, with real Pittsburgh content. The selected cream/forest palette, serif venue titles, real photography and custom map remain; new behavior follows the user's explicit correction rather than the original three-pin mockup.

- Every venue renders separately. No numbered covers/clusters, automatic selection, carousel, next-card peek or sideways place navigation. Photo pins load their real source images before selection; category symbols remain for unavailable photos. Photo markers have a higher stacking order than nearby category markers. At city scale individual venues can overlap geographically; zoom separates them without hiding membership behind a count.
- Main card now has a single image/title/action hierarchy, a reachable Tonight bookmark, Directions and a functional handle. Native vertical gestures dismiss/open taller details. Horizontal movement neither switches the venue nor accidentally opens photo details.
- Tonight active-state contrast was inspected: the filled forest bookmark with white icon/text is visible after its transition. The collection is a compact venue list with a short reset disclosure, not another onboarding overlay. The earlier screenshot captured the initial color-transition frame; settled-state captures verify contrast.
- Font hierarchy, card spacing, action visibility, palette, source photography and concise copy inspected in rendered states. Narrow phone has no page overflow; measured card height keeps zoom controls above its close target. Main actions stay reachable; full detail content scrolls independently.
- Live test includes exact 613 individual marker count; no clusters or default selection; automatic photo loads; actual CDP touch gestures; no horizontal switching; Tonight save/reload/offline/remove. A pre-release plan survived deployment, and Tonight → plan → memory survived offline reopening. 87 tests pass; build passes with its existing size warning. No physical-device testing.
- Website photos remain online-only; source failures fall back to icons. Forced-offline image disconnection errors are expected and separated from online checks. No new photo-coverage claim beyond 289/613.

No actionable P0/P1/P2 issue remains in this scoped release. Live acceptance and deployment details are in the project plan and `output/playwright/tonight-release/`.

---

# October 28 follow-up: user-directed full map

The latest user request supersedes the concept's three-pin limit and automatically open card. The selected visual identity remains; the required opening state is now an unselected full map. This focused behavior refinement does not require a new concept selection.

Evidence: `output/playwright/full-map/phone-map.png` (390×844), `desktop-map.png` (1440×1000), `narrow-map.png` (360×740), `phone-selected.png`, `flow.txt`, `persistence.txt`. Browser-rendered captures inspected after fixes. Card hierarchy, type, cream/forest palette and real photo treatment are retained from the approved implementation below.

- Fixed P2: phone zoom overlapped the card's Close button; zoom now follows measured card height. The final screenshot shows independent targets and browser click succeeds.
- Fixed P2: neighboring grid clusters could overlap photos/count buttons; nearby groups now merge without dropping venues. Final desktop/phone captures have separated cluster targets. A regression test preserves exact membership and the selected individual pin.
- Map and list share all filtered venues. Initial/reload state has no selected pin, card or inspector. Map toggle and card close clear the selection. Cluster click zooms; individually selected venues open the existing card.
- 83 tests pass; build passes with the existing bundle warning. Browser checks preserve all 613 map venues, filter to 289, verify carousel/navigation, and retain a saved plan offline with the licensed offline-photo list. No page exceptions. Physical devices were not tested.
- No deployment or photo-catalog changes. Historical design comparison below documents the earlier selected implementation; its three-pin behavior is no longer current.

Final result: passed for this focused refinement.

---

# Bordone — selected option 2 implementation review

**Final result: passed**

Scope: fidelity and usability of the selected Living City discovery surface. This does not mark majority photo coverage, every saved-outing page, or deployment complete.

## Evidence and normalization

- Source visual truth: `/Users/Test/.codex/generated_images/01a17995-14ba-7cb0-bfb3-9d91d067a842/exec-afe27206-5686-4744-ae87-218ddad3557a.png`, selected by Zack as option 2.
- Browser implementation: `http://127.0.0.1:4350/?preview=living-city`.
- Phone capture: `/Users/Test/Developer/boredone/output/playwright/redesign-oct28/phone-first.png`.
- Source 853×1844 pixels, proportionally normalized to approximately 390×843. Implementation 390×844 pixels at 390×844 CSS viewport, deviceScaleFactor 1. No device bezel or browser chrome. Source is an illustrative concept; real map geometry and real provider data replace illustrative pin positions/copy.
- Full-view combined evidence: `/Users/Test/Developer/boredone/output/playwright/redesign-oct28/comparison.png` (source left, implementation right).
- Focused combined card evidence: `/Users/Test/Developer/boredone/output/playwright/redesign-oct28/comparison-card.png`.
- Additional captures: `desktop.png` at 1440×1000; `narrow.png` at 360×740; `phone-collapsed.png`; `desktop-detail.png`; `offline.png`, all in the same evidence directory.
- State: Pittsburgh, online, first featured venue Meat & Potatoes, no selected full Details overlay. Supplementary captures exercise Details and offline states. Browser fallback was explicitly authorized; one isolated task session was reused.

## Findings and comparison history

1. [P2, fixed] At 360×740, the secondary La Prima label overlapped the selected pin. The short-phone rule now retains the active label and hides secondary labels; all three photo targets remain. Post-fix `narrow.png` confirms no overlap and visible primary actions. The normal-height comparison retains all labels.
2. [P2, fixed] The main card's visual handle initially had no action. It is now a semantic expand/collapse button with vertical touch dragging; the compact state retains the active venue and View place. `phone-collapsed.png` shows the resulting map space. `handle-flow.txt` verifies actual CDP touch collapse and button reopening, not just a screenshot.
3. [P1, fixed functional issue] A cached older shell could remain active indefinitely behind open tabs. Activation now waits for complete precaching and then skips waiting; browser reload testing retained the old saved memory and the new UI offline. This was verified separately from visual fidelity and does not count as a visual comparison iteration.

The post-fix full-view and focused-card comparison has no remaining actionable P0/P1/P2 visual mismatch in this scope.

## Required fidelity surfaces

- **Fonts/typography:** Georgia provides the selected serif wordmark and place-heading hierarchy; existing app sans-serif remains on actions/facts. Titles and actions are readable, with intentional heading/body contrast. The generated reference is not an exact font specification. The implemented wordmark is somewhat larger; accepted as an identity-preserving adaptation.
- **Spacing/layout:** Opening map/card proportions remain close to the concept. Card image, title, facts and primary action fit on 390×844 and 360×740. A small next-card peek communicates horizontal browsing. Desktop uses a 400px card over the map with visible controls. Added pager and source credit consume a little vertical space; accepted for keyboard navigation and provenance. Short-phone collision was fixed and recaptured.
- **Colors/tokens:** Cream `#fffcf1`, forest `#204b36`, quiet sage boundaries and the existing warm map palette preserve the selected direction. Selected pins and primary actions share forest emphasis. No new decorative palette or gradient treatment.
- **Images/assets:** Actual venue website photo used for Meat & Potatoes, not generated food art. Round map photos use real source data with correct source records. All six featured photos loaded under the preview's CSP. Phosphor map/list/bookmark/arrow assets provide consistent controls. Actual MapLibre geography is intentional, rather than replacing the functional map with the illustrative source raster. Brand photography is disclosed; historical imagery is not claimed to show current interiors.
- **Copy/content:** Make a plan, Details, Saved and the city selector retain the concept's concise hierarchy. Distance/category and attributed guide evidence replace illustrative neighborhood claims. No invented prices, hours, ratings or social popularity. Source credits and pager are explicit product additions. Expanded source explanations remain secondary.

## Interaction and resilience verification

- Native browser touch horizontal swipe changes selected card/pin; Previous/Next and keyboard navigation remain available.
- Native touch main-card collapse; button reopening. Full Details touch dismissal, Map/List switch, Results, browser Back and Escape tested.
- Desktop 1440×1000, phone 390×844, short phone 360×740; no horizontal page overflow or hidden primary actions.
- Plan → reload → memory tested during the implementation; pre-update memory retained across final offline reload. Fourteen licensed photo candidates remain offline; remote website photos are not bundled.
- All six featured images loaded; final online console check recorded zero errors. Final main-flow listener recorded zero page exceptions.
- Semantic labels, visible button controls, reduced-motion handling and keyboard alternatives remain. This is not a comprehensive accessibility audit or physical-device test.
- 82 automated tests pass; build passes with the existing chunk-size warning. Tests/build do not establish design quality; the comparisons above were inspected separately.

## Follow-up polish and open product gaps

- [P3] Future real-world use can tune the six-place selection and photo crops. Preserve the selected hierarchy rather than adding persistent controls.
- Only 289/613 venues and 217/465 restaurants/bars/pubs have online photos. Majority coverage remains unmet and is documented in the plan.
- Remote website photo availability and stale directory facts remain source limitations. The zero-budget engine does not provide live opening status.
- No production deployment occurred. Other saved-outing screens were not wholly redesigned in this pass.

## Implementation checklist

- [x] Apply selected option 2 to the functioning app.
- [x] Fix and recapture short-phone labels and card-handle behavior.
- [x] Compare full view and focused card against the selected source.
- [x] Verify touch, navigation, photo loading, save persistence and offline update.
- [x] Record exact coverage and limitations in the existing project plan.

final result: passed

Final rendering follow-up: photo icons remain until image decoding finishes; Tonight bookmark feedback has no transient color delay. Production response: `output/playwright/tonight-release/deploy-render-fix.txt`; focused live verification: `live-render-check.txt` and `live-render-card.png`.

Final visual inspection: live desktop and phone captures reviewed; warm map identity, individual photo pins and bottom zoom controls remain intact. Live emulated two-finger pinch passed with zero image-node replacements.


October 29 photo expansion: reviewed 40 additional photo-bearing records against official-site identities and actual image pixels; expanded guide 329/613 photos, restaurant/bar/pub 257/465. No layout redesign. Local and live 390×844 / 1440×1000 map and newly added Pizza Fiesta card screenshots reviewed in `output/playwright/photo-expansion/`. Original image attribution and brand label visible, photo pins remain fixed-size through zoom, Tonight/offline photo flow passed. Deployed `dpl_47NEUjSSdMjViJFE3xutq6SUe52p`; 94 automated tests pass. No physical phone verification.
