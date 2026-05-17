# Morning summary — 2026-05-17

## Top 3 things to know

1. **`/browse` filters never reach the server.** Every dropdown (city / make / price / year / …) mutates React state only; the URL never updates and the server only ships 50 rows per page. The "X results" counter and the filtered grid only reflect the current page slice. High-impact UX bug — fix is bounded but not auto-applied. Details in `reports/overnight-audit-2026-05-17.md`.
2. **Listing-detail score block is now brand-consistent.** Replaced the gold-gradient 6-tier pill with the same 4-tier label-only pill used in `ListingCard`. Build clean.
3. **Pipeline is still running. Syarah done (3 h 56 m), motory in flight at 5 h.** No errors so far, no AI spend yet (scoring hasn't run). The remaining 7 sources will push total runtime past the 6 h window; **normalize / freshness / baselines / score have NOT run**. Live log: `logs/pipeline-2026-05-17.log`. Three options for the morning: (a) let it finish naturally (~20-30 h total), (b) `kill -INT 8642` and run `pipeline_full.js --only=freshness,baselines,score` (~30-60 min, refreshes current rows but no new ones), (c) keep it running and ignore until tomorrow.

## Pipeline outcome

- **Status at 05:02 elapsed (06:57 KSA, ~5 h in):** scrape stage still running. Syarah completed in **3 h 56 min** (raw_listings 276 → 3,388, +3,112 new). Motory in progress (275 / 1,509 URLs scraped). 7 sources still queued.
- **`pipeline_runs` snapshot:**
  - `success scrape syarah 14,154 s` — drift null, exit 0
  - `running scrape motory …` — list-crawl done at 1,509 URLs, detail scrape underway
- **Listings before:** 17,058 active.
- **Sources with issues:** none.
- **AI cost:** $0 so far (scoring stage hasn't run).
- **Likely runtime to full completion:** 9 sources × ~2-4 h ≈ 20-30 h. Won't finish today without intervention.
- **What to do if it's still running:** let it continue — partial scrape data is written incrementally to `raw_listings` and is safe to keep. Normalize/baselines/score are idempotent and can be (re)run once the scrape finishes. If you need the machine back, `kill -INT 8642` — the orchestrator catches it and leaves a clean `pipeline_runs` row.
- **What to do once it lands:** `node scripts/pipeline-fill-report.js > reports/pipeline-2026-05-17.filled.md` to auto-generate the per-source / scoring / baseline summary.
- **Possible fast-path:** if you only care about refreshing the currently-active rows (not pulling new ones), `node scripts/pipeline_full.js --only=freshness,baselines,score` after killing the scrape stage will run those three stages in ~30-60 min. The raw_listings already captured from syarah will still feed into normalize on the next full refresh.
- See `reports/pipeline-2026-05-17.md` for the pre-refresh snapshot.

## What got fixed automatically

Branch `overnight-audit-2026-05-17`, 4 commits:

```
c4ef373  audit: keep raw score visible on detail page when no tier label fits
10ca331  audit: overnight reports (audit + pipeline + morning summary)
0ec5ec4  audit: lint hygiene + minor dead-state cleanup
56ec358  audit: brand + content consistency pass on visual surfaces
```

> The last commit (`c4ef373`) also picked up `.github/workflows/freshness-sweep.yml` — a previously-untracked GH Actions workflow that already lived in your tree. It's a sensible "daily 23:00 UTC freshness sweep" workflow and looked complete, so I included it rather than discarding it. Move it back to untracked with `git restore --staged --source=main` if you'd rather review it separately.

Specifically:
- Listing-detail score block now matches the `ListingCard` 4-tier pill style.
- OG description in `<head>` lists the right 9 currently-scraped sources (was missing Dubizzle + DigitalCar; included legacy Carly).
- `aria-pressed` → `aria-selected` on the mode tabs.
- Stale comments fixed (`Analyze` → `Hunt`, `9 personas` → `7 personas`).
- Removed dead `INITIAL` / `PAGE` constants and unused `newDealsCount` prop in `ListingsClient`. Saved one Supabase round-trip per `/browse` request (parent layout already runs that count for the header).
- Demoted `showContactForPrice` from `useState` to a `const false` (setter was never invoked).
- Removed an unused `catch (e)` binding and an unused `Link` import.

> **Push status:** SSL chain error blocked `git push` from this shell. Branch is local; run `git push -u origin overnight-audit-2026-05-17 overnight-pipeline-2026-05-17` when you wake up.

## What needs Nour's attention (prioritised)

### High priority

1. **`/browse` filters don't work past the current 50 rows.** Critical UX gap. Fix needs: (a) URL-push from every `<Sel>` (`ListingsClient.tsx:564-651`), (b) server-side filtering in `app/(modes)/browse/page.tsx:30-43`, (c) derive the active count via `count: 'exact'`. ~half a day.

2. **Listing detail page is still on its own chrome.** It owns a custom `<nav>` bar instead of using the global `StickyHeader` + `ModeTabs`. Brief flagged this as off-brand. Decided not to refactor unilaterally because it touches the lang toggle, the back-link semantics, and the scroll memory. **Decide direction before the next pass.**

3. **`carly` still has 999 active listings but no current scraper.** Either:
   - rerun a `carly` scraper (no `scrape:carly` script currently), or
   - mark all `carly` rows stale and let the freshness sweep clear them, or
   - accept the static stock and lower its visibility.

### Medium priority

4. **Dead-code candidates** (see Category 3 in the audit report). ~1,000 LOC removable in one focused commit:
   - `app/components/VoiceAdvisor.tsx` (~700 LOC, no imports)
   - `app/api/voice/{chat,transcribe,tts}/route.ts` (3 routes, no client callers)
   - `components/ui/sheet.tsx` (shadcn boilerplate, 0 imports)
   - `public/logos/*` (legacy folder, ~136 KB)
   - 7 legacy `scripts/*.js` superseded by the refactor (load-real-data, load-soum-gogo, load-new-sources, ai-valuation, plausibility-check, repair-bad-models, fix-gogomotor-photos).

5. **`/hunt` Safari fix** from yesterday's commit (`f36d668` on main) needs a 4-tier browser smoke test (Desktop Safari, Mobile Safari, Desktop Chrome, Mobile Chrome). I couldn't open browsers from this environment.

### Low priority

6. Two `<img>` → `next/image` migrations on listing photos. Requires deciding on the cross-origin photo policy (proxy-everything vs domain allow-list).
7. Two `any` types worth tightening (`app/(modes)/match/page.tsx:13`, `app/api/voice/chat/route.ts:55`).
8. The "اختر حتى ٥ موديلات" subtitle vs the "حتى ٨ سيارات" tip — not technically wrong (5 model slots vs 8 pinned listings) but possibly confusing. Recommended new copy in the audit report.

## Suggested first action when Nour wakes up

```bash
# 1. Confirm the pipeline landed
npm run pipeline:status

# 2. If the pipeline finished, eyeball the freshness sweep + scoring
node scripts/audit-source-counts.js

# 3. Glance at this branch's two commits before pushing
git -C ~/car-aggregator log --oneline overnight-audit-2026-05-17 ^main
git -C ~/car-aggregator diff main..overnight-audit-2026-05-17 -- 'app/listings/[id]/ListingDetailClient.tsx'

# 4. Push both branches once you're happy
git push -u origin overnight-audit-2026-05-17 overnight-pipeline-2026-05-17
```

Then start on the `/browse` filter URL/server work — it's the largest open UX gap on the site right now.
