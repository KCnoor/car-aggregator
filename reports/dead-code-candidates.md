# Dead-code deletion candidates

**Status:** review-only. Nothing has been deleted. Pending your approval.

## A. Legacy loader scripts (superseded by Layer 2 normalize.js + scrapers/_shared)

These scripts pushed JSON snapshots from `~/haraj-scraper/` directly into the `listings` table. Replaced by `raw_listings` → `scripts/normalize.js` flow.

| Path | Why dead |
|---|---|
| `scripts/load-real-data.js` | The old DB-median scoring + bulk-insert path. Contained the duplicated scoreFromRatio. Replaced by the scrapers + `normalize.js` + `compute_baselines.js` + `score.js` chain. |
| `scripts/load-soum-gogo.js` | Hardcoded loader for two sources. Logic moved into `lib/scoring/normalize.js` and per-source scrapers. |
| `scripts/load-new-sources.js` | Loaded carly/yallamotor/saudisale from JSON files. Superseded by direct scraper → raw_listings. |
| `scripts/repair-bad-models.js` | One-shot DB fix (Haval Jolion Pro misidentification). Already applied. |
| `scripts/fix-gogomotor-photos.js` | One-shot URL rewrite. Already applied. |
| `scripts/ai-valuation.js` | All logic relocated into `lib/scoring/ai-valuation.js`; entry point is now `scripts/score.js`. |
| `scripts/plausibility-check.js` | Shorthand-fix + re-scoring logic relocated into `lib/scoring/normalize.js` and `scripts/score.js`. |

## B. Files in `~/haraj-scraper/`

The entire folder will be tarballed into `backups/haraj-scraper-archive-<ISO>.tar.gz` and renamed to `~/haraj-scraper-legacy-<date>` BEFORE deletion — per plan safety sequence.

**Active scrapers — logic now lives in `~/car-aggregator/scripts/scrapers/`:**
- `syarah-bulk.js` (and `syarah-scraper.js` — the v1 partial), `motory-bulk.js` (and `motory-scraper.js`, `motory-bulk.js`), `soum-scraper.js`, `yallamotor-scraper.js`, `gogomotor-scraper.js`, `saudisale-scraper.js`, `carly-scraper.js`, `scrape.js`, `scrape-bulk.js`, `fetch-logos.js`

**Helpers:**
- `scrapers/normalize.js` — replaced by `lib/scoring/normalize.js` + `lib/scoring/translations.json`.
- `scrapers/translations.json` — copied verbatim into `lib/scoring/translations.json`.
- `scrapers/translation-cache.json` — Haiku-resolved translations. Not yet ported (the new normalize.js does dictionary-only lookup; no online translation fallback). If a future scraper surfaces unknown Arabic terms, we'd need to re-introduce this.
- `apply-normalization.js`, `enrich-ai.js` — the post-process JSON pipeline. Replaced.

**Probe / test / debug — pure exploratory scratch:**
- `probe-all.js`, `probe-carly-api.js`, `probe-saudi-carswitch-dom.js`, `probe-saudi-listing.js`, `probe-saudi2.js`–`probe-saudi5.js`, `probe-yalla-api.js`, `probe-yalla-carswitch.js`, `probe-yalla-dom.js`, `probe-yalla-saudi.js`, `probe-yalla.js`, `probe-yalla2.js`
- `find_listing2.js`, `find_priced_listing.js`, `find_priced_v2.js`
- `gogo-api.js`, `gogo-list.js`, `gogo-pagination.js`, `gogo-test.js`, `soum-test.js`, `debug_page.js`
- Roughly 1,500 LOC total across ~30 files. Zero downstream consumers.

**Output JSON files (these are derived data, not source — already in `raw_listings` going forward):**
- `*-listings.json` (8 files), `*-urls.json` (3 files), `haraj-listings*.json` (4 files), `*-listings-ai.json`

## C. Items to PRESERVE (do NOT delete)

| Path | Why |
|---|---|
| `lib/scoring/ai-valuation-cache.json` (actually under `scripts/`) | Active 902KB cache. Layer 4 reads + appends to it. Cache hit rate during Phase A was 95.7%. |
| `lib/scoring/translations.json` | New canonical home for AR↔EN dictionary. |
| `scripts/backup.js`, `scripts/normalize.js`, `scripts/compute_baselines.js`, `scripts/score.js`, `scripts/validate-phase-a.js` | New v2 pipeline. |
| `scripts/scrapers/*` | New scraper home. |
| `app/`, `components/`, `lib/supabase.ts`, `lib/translations.ts`, `lib/utils.ts` | App — untouched per non-goals. |
| `supabase/migrate-v*.sql` | Migration history. |
| `backups/listings-backup-*.json` (gitignored) | Pre-refactor snapshot. Useful for rollback. |

## D. Anomalies surfaced during scrapes

1. **Soum cars marketplace shut down.** Both `/en/cars/{make}/{model}` and `/en/category/cars` URLs redirect to the homepage. Existing product URLs return `?redirectReason=productNotFound`. The 139 legacy Soum listings in `listings` are likely stale. **Recommend dropping Soum from `scrape:all` and flagging the 139 stale rows for the next housekeeping pass.**
2. **`@anthropic-ai/sdk` in `package.json` but `node_modules` install incomplete.** Code falls back to raw HTTPS; SDK never actually used. Either run `npm install --force @anthropic-ai/sdk` to fix, or remove from package.json. Not blocking.

## Summary

| Bucket | Files | LOC (approx) |
|---|---:|---:|
| `scripts/` legacy loaders + plausibility + ai-valuation | 7 | ~1,400 |
| `~/haraj-scraper/` active scrapers (logic ported) | ~10 | ~3,500 |
| `~/haraj-scraper/` probe/test scratch | ~30 | ~1,500 |
| `~/haraj-scraper/` output JSON files | ~15 | (data, not code) |
| **Total code deletable** | **~47 files** | **~6,400 LOC** |

**Awaiting your "approved" on this list before any deletions occur.**
