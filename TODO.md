# TODO — Post-refactor follow-ups

These are deferred items uncovered during the v2 refactor. Captured here for the next iteration.

## Cost / scaling

- **Anthropic prompt caching didn't activate** in the Phase A.5 scoring run because the system prompt was ~600 tokens — below Haiku's 1,024-token minimum for cache_control to take effect. Cost was still well under budget ($2.27 vs $5 ceiling) thanks to the file cache + payload trimming + multi-upload skip, but for routine re-runs at scale:
  - Option A: expand the system prompt past 1,024 tokens with a small set of canonical few-shot examples (real listings + ideal output JSON). This is the simplest activation path.
  - Option B: investigate batched scoring strategies where a single prompt covers multiple listings in one call — reduces per-listing overhead and cache amortization improves.

## Data quality follow-ups

- **Haraj make/model mis-classification**: spot-checks during the v2 Haraj quality gate showed several survivors with wrong (make, model) assignments — e.g., URL `Kia_Carnival_Diesel_2021` but listing tagged Hyundai Elantra. Likely a stale Haiku-translation artifact from the legacy `haraj-scraper/scrapers/normalize.js`. Worth a single-pass re-resolution against URL slug.
- **Dealer signature gap**: only 988 / 17,287 listings have a dealer_signature populated, because most scrapers (Syarah, Yallamotor, Gogomotor, etc.) don't capture seller name. To enable cross-platform dealer detection, extend scrapers to capture seller phone or normalized seller display name.
- **Soum dictionary coverage**: 391 make_slug fills were recovered via model→make inference, but Soum's model_en values still have weird slug shapes ("3008-3008", "6-mazda-6"). Worth a one-pass parser fix that cleans these at scrape time.

## Scraper gaps

- **Yallamotor price-parser bug** (fixed in this round): card HTML can render `SAR 23,000` and the year `2009` without a separator, causing the original `[\d,]+` regex to swallow both. Now using `\d{1,3}(?:,\d{3}){0,2}\b`. Worth a similar audit pass on other Playwright-card scrapers.
- **CarSwitch extraction rate ~51%**: 328/643 URLs extracted. The 49% null returns are likely listings where Playwright's `domcontentloaded` fires before card hydration. A `waitForSelector('[data-testid="listing-price"]', { timeout: 8000 })` style guard would improve recovery.
- **Dubizzle depth ~920 listings**: Dubizzle has 16k+ active ads in Riyadh per their site claim, but per-make + main routes only surfaced ~922 unique URLs. Likely need per-city + filter-combination routes to drill deeper.

## Baseline robustness

- **Baseline scope `country` dominates city** (486 country vs 201 city). When city data thickens, switch to a more aggressive city-specific lookup for known high-volume cities (Riyadh, Jeddah, Dammam) where ≥10 samples exist.
- **Multi-upload inheritance was incorrect** (fixed in this round): copying a sibling's score to all multi-uploads in a cross_source_listing_group produced wildly wrong scores when sibling prices varied. Now each multi-upload scores against its own price. Long-term, consider computing a single canonical "group score" using the group's median price and applying it uniformly — but only for groups where prices are tightly clustered.

## Validation

- **Wreck pattern bug** in `lib/scoring/redflags.js`: `\bdamaged?\b` matches singular/past-tense but not plural "damages". Fix: `\bdamage(d|s)?\b`. Caught by audit; not yet applied. Low impact (1 false negative across 17k listings) but should be fixed.

## Operational

- Old `score.js --auto-continue` flag accepts an empty stdin and proceeds past cost cap silently — desirable in CI but worth documenting that running without it requires interactive confirmation.
- Cache file `scripts/ai-valuation-cache.json` grows unbounded. At ~1 MB after this run; will need rotation if we re-score the corpus quarterly.
