# Overnight audit — 2026-05-17

Branch: `overnight-audit-2026-05-17` (not merged; awaiting review)
Window: ~6 h autonomous. Live total at start: **17,058 active listings** across 11 source labels.
Commits:
- `56ec358 audit: brand + content consistency pass on visual surfaces`
- `0ec5ec4 audit: lint hygiene + minor dead-state cleanup`

Build verified clean after each commit (`npm run build` — 0 errors).

> **Note on push:** push to remote was blocked by an SSL trust-chain error in this shell. The branch is local; Nour can `git push -u origin overnight-audit-2026-05-17` in the morning.

---

## Category 1 — Visual + content consistency

### Applied (committed)

| Route / file | Finding | Severity | Fix |
|---|---|---|---|
| `app/layout.tsx:27` | OG description listed "Carly" (legacy, no scraper) and omitted Dubizzle + DigitalCar; "9 sources" claim was inconsistent with the names. | Medium | Replaced source list to match the 9 currently-scraped platforms (syarah, soum, motory, yallamotor, saudisale, GoGoMotor, CarSwitch, Dubizzle, DigitalCar). |
| `app/listings/[id]/ListingDetailClient.tsx:30-40, 238-265` | Score block used a gold-gradient pill with a 6-tier scale (`صفقة ممتازة … سعر مبالغ`) that didn't match the `ListingCard` 4-tier label-only pill. Two visual languages for the same score. | High (explicitly flagged in brief) | Reused the same 4-tier `dealConfig` rule as `ListingCard`. Detail page now shows the same flat coloured pill alongside the raw `9.4` number (raw number stays detail-only). |
| `app/components/ModeTabs.tsx:80` | `aria-pressed={isActive}` is invalid on `role="tab"` — eslint `jsx-a11y/role-supports-aria-props`. | Low (a11y) | Changed to `aria-selected`. |
| `app/page.tsx:4` | Comment listed modes as "Match, Analyze, Pulse" — Analyze was renamed Hunt long ago. | Low (comment rot) | Fixed. |
| `app/(modes)/match/MatchClient.tsx:31` | Comment said "9 personas" but the array has 7 (post-trim). | Low | Replaced with accurate "7 personas (post-trim: city_only merged into first_car, investment dropped)". |
| `app/listings/[id]/page.tsx:2` | Unused `Link` import. | Trivial | Removed. |

### Pending human review

- **`/hunt` subtitle vs Layers tip wording.** Subtitle: *"اختر حتى ٥ موديلات"*. Layers tip: *"يمكنك مقارنة حتى ٨ سيارات"*. The two numbers describe **different** things (5 model slots vs 8 pinned listings), so it's not technically wrong. But the brief flagged it as confusing. Recommend tightening the subtitle to: *"اختر حتى ٥ موديلات وقارن حتى ٨ سيارات على المخطط."* Did not apply — wording is a judgement call.
- **Listing detail page chrome.** The detail page still owns its own `<nav>` bar (back-link + wordmark + lang toggle) instead of using the global `StickyHeader` / `ModeTabs`. Moving it under the `(modes)` shell is a bigger refactor — back-link behaviour, scroll memory, and the second lang toggle would all need decisions. Marked for next pass.
- **"العودة للقائمة" always goes to `/browse`.** Even when the user arrived from `/hunt` or `/match`. Recommend `router.back()` with `/browse` as a fallback. Did not apply — preserves current behaviour.

### Live counter ribbon — surfaced for review

`/lib` query (committed as `scripts/audit-source-counts.js`):

```
saudisale    4619
yallamotor   3771
syarah       2785
gogomotor    1470
motory       1326
carly         999  ← legacy data, no current scraper
dubizzle      909
soum          686
carswitch     328
digitalcar    101
haraj          64  ← legacy data, deprioritised
TOTAL       17058
```

- `carly` has 999 active listings but **no current scraper**. Either:
  - rerun an old `carly` scraper to refresh, or
  - sweep `carly` rows inactive (via freshness check), or
  - lower `MIN_LISTINGS_FOR_RIBBON` interaction so the brand stops appearing once the data ages out.
- `haraj` (64) is below the 500-row ribbon threshold so it's already invisible. Fine as-is.
- Brand string "9 مصادر" / "9 sources" in `StickyHeader.tsx:38, 229` is accurate for currently-scraped platforms; left untouched.

---

## Category 2 — Bug hunt

### Critical — flagged, NOT auto-fixed

**`/browse` filters never reach the server.** All filter dropdowns (make / model / city / price / year / body / fuel / transmission / source / condition) mutate React state only. They never push to URL, and the server only ever ships 50 rows per page. So:

- *Apply filter on page 1* → only those 50 rows are filtered. The "1,283 results" counter at the top-right shows the in-memory filtered count, not a true DB count.
- *Refresh* → all dropdowns reset to "any".
- *Filters + pagination* → filters silently apply only to the current page slice.

`ListingsClient.tsx:165-220` and the predicate at `:330-372` confirm this. The only URL params that round-trip are `?page=`, `?q=`, and `?new24h=1` (handled in `goToPage`, `SearchBox.submit`, and the `useEffect` at `:205-219`).

This is high-impact but a non-trivial fix — needs server-side filtering in `browse/page.tsx` plus URL pushing from every `<Sel>`. Out of scope for an autonomous overnight pass. **First task to estimate in the morning.**

### Other findings

| Area | Finding | Notes |
|---|---|---|
| `/hunt` interaction | Per the most-recent commit (`f36d668`) on `main`, a 36×36 invisible hit target + `onPointerDown` was added to fix the Desktop Safari click bug. Cannot verify cross-browser from this environment. | Needs manual Desktop-Safari smoke before declaring resolved. |
| `/hunt` MAX_SLOTS | Set to 5 in `HuntClient.tsx:29`; PIN_CAP set to 8. Subtitle / tips consistent. No bug. | — |
| `/match` "بشيلك أنا" button | Wires to `setHelpOpen(true)` and the modal at `MatchClient.tsx:380-…` works. Brief flagged as possibly dead — confirmed live. | No fix needed. |
| `/listings/:id` back-link | `<Link href="/">` redirects through `/` → `/browse`, so it always lands on browse regardless of origin (`page.tsx:1-8`). | Documented above. |
| `/api/voice/*` routes | Live in code; the calling `VoiceAdvisor` component is intentionally retired and not mounted anywhere (`ListingsClient.tsx:459` comment confirms). The three routes are reachable but unused by the frontend. | Kept by comment-intent. |
| `image` → `next/image` | `ListingCard.tsx:100`, `ListingsClient.tsx:529`, `VoiceAdvisor.tsx:514`, `ListingDetailClient.tsx:120` use raw `<img>`. Listing photos come from external Saudi-source CDNs, some of which would need the proxy or explicit `domains` config. | Document; do not fix this pass — adding `next/image` for cross-origin Saudi CDNs is error-prone. |
| `aria-pressed` on tabs | Fixed. | See Category 1. |

---

## Category 3 — Code quality + dead code

### Lint baseline (run on overnight-audit branch)

`npm run lint`: 219 problems (185 errors, 34 warnings). All 185 errors are `no-require-imports` on `scripts/**.js` — these are intentional CommonJS scripts (loaded by node, not by Next.js) and not actually broken. App-tree errors: **0**.

### Applied (committed)

- Dropped unused `INITIAL` / `PAGE` legacy infinite-scroll constants and the leftover `newDealsCount` prop (both `ListingsClient.tsx`). Removed the duplicate new-deals-today count query in `browse/page.tsx` (parent layout already runs it for the header — saved one Supabase round-trip per `/browse` request).
- Demoted `showContactForPrice` from `useState` to a `const false` — the setter was never invoked; the predicate `listings.filter(l => !l.contact_for_price)` already runs unconditionally.
- Removed the unused `catch (e)` binding in `app/api/freshness-check/route.ts:106`.

### Pending human review — dead code candidates

| Path | Size | Confidence | Notes |
|---|---|---|---|
| `app/components/VoiceAdvisor.tsx` | ~700 LOC | High dead | Not imported anywhere. The retired-voice-feature comment in `ListingsClient.tsx:459` confirms it's intentionally orphaned. Delete or move out of `app/components`. |
| `app/api/voice/{chat,transcribe,tts}/route.ts` | 3 routes | High dead | Reachable as endpoints but not called from any client (the VoiceAdvisor that called them is unmounted). Keep if the voice feature is coming back; otherwise delete. |
| `components/ui/sheet.tsx` | 138 LOC | High dead | shadcn boilerplate, 0 imports. |
| `public/logos/*` (11 files, ~136 KB) | 136 KB | High dead | Superseded by `public/source-logos/`. No references in code, HTML, or CSS. |
| `scripts/load-real-data.js` | 1 file | High dead | Pre-refactor loader; superseded by `scripts/normalize.js`. Unreferenced. |
| `scripts/load-soum-gogo.js` | 1 file | High dead | Same — superseded by `normalize.js`. |
| `scripts/load-new-sources.js` | 1 file | High dead | Same. |
| `scripts/ai-valuation.js` | 1 file | High dead | Relocated to `lib/scoring/ai-valuation.js`. |
| `scripts/plausibility-check.js` | 1 file | High dead | Relocated to `lib/scoring/redflags.js`. |
| `scripts/repair-bad-models.js` | 1 file | One-shot done | Comment in file says it's a one-time fix. |
| `scripts/fix-gogomotor-photos.js` | 1 file | One-shot done | Same. |

**Note:** all "High dead" items were also flagged in the original `refactor-pipeline-v2` plan as deletable. Did not delete here because the brief explicitly says "only delete code if 100% sure it's dead. When in doubt, document for human review." — and a few of these still get referenced by comments. Recommend a single dedicated cleanup commit after morning review.

### Lint warnings worth noting (not auto-fixed)

- `ListingsClient.tsx:189:19` — `setSort` is used in `runSearch` declared *before* `useState`. Works at runtime due to JS hoisting + the fact that `runSearch` is only invoked from a `useEffect` after mount; but the lint warning is real and could bite if the call order ever changes.
- `HuntClient.tsx:136:11`, `HuntClient.tsx:161:21` — eslint react-hooks errors about state updates inside an effect. Pre-existing patterns; no observed user impact.
- `app/(modes)/match/page.tsx:13` and `app/api/voice/chat/route.ts:55` — two `any` types. Pre-existing.

---

## Category 4 — Performance check (sanity only)

Could not run Lighthouse from this environment (no browser MCP available). Limited to bundle + asset sanity:

### Bundle sizes (`.next/static/chunks/`, uncompressed)

```
342 KB  one chunk (likely recharts — only loaded on /hunt)
227 KB  one chunk
145 KB  one chunk
137 KB  one chunk
134 KB  one chunk
Total static/chunks: 1.8 MB uncompressed → ~600 KB gzipped (acceptable)
```

### Public assets

```
2.4 MB  public/brand/         ← 2 MB of source PNGs (source-logo + sprite) for extract-brand-assets.js
188 KB  public/modes/         ← 4 mode icons, ok
140 KB  public/source-logos/  ← 11 brand SVGs/PNGs, ok
136 KB  public/logos/         ← LEGACY; superseded by source-logos/
108 KB  public/icon-512.png
```

**Recommended action items, low-impact:**

- Move `public/brand/source-logo.png` + `source-icons-sprite.png` out of `public/` into something like `scripts/source-assets/`. They are source files for `extract-brand-assets.js`, not served at runtime — but living in `public/` means a curious crawler can fetch them.
- Delete `public/logos/` (see Category 3).

### Image policy

`ListingCard` and the detail page use raw `<img>` for listing photos. This is intentional because:
- Photos come from external Saudi-source CDNs (img.gogomotor.com, cdn.soum.sa, etc.).
- Some are routed through `/api/img-proxy` already.
- Migrating to `next/image` would require either adding all source CDNs to `next.config` `images.domains` or routing every photo through the proxy.

Defer to a focused pass with the CDN list confirmed.

---

## Suggested first action in the morning

**Fix the `/browse` filter bug** (Category 2 — Critical). It's the single largest UX gap in the audit. The fix is bounded: URL-push from every `<Sel>`, server-side filtering in `browse/page.tsx`, derive the active count from a `count: 'exact'` query. ~half a day's work.

Second: review the dead-code list and run one dedicated cleanup commit (estimated ~1,000 LOC removed).
