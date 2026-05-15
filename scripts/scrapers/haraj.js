'use strict'
// scripts/scrapers/haraj.js — Haraj is DEPRIORITIZED in pipeline v2.
// The full scraper logic lives in ~/haraj-scraper/ (legacy). It is intentionally
// excluded from `npm run scrape:all`. This stub exists so the npm script alias
// resolves and is invocable for emergencies, but it explicitly refuses to run
// unless --force is passed.

if (!process.argv.includes('--force')) {
  process.stderr.write('[haraj] Haraj is deprioritized in pipeline v2. Existing Haraj rows in `listings` are preserved\n')
  process.stderr.write('        but no new Haraj data is scraped. To override and run the legacy scraper directly,\n')
  process.stderr.write('        invoke it from the legacy folder:\n')
  process.stderr.write('          node ~/haraj-scraper/haraj-scraper.js   (or pass --force here)\n')
  process.exit(0)
}

process.stderr.write('[haraj] --force passed but no in-tree haraj scraper exists yet in v2.\n')
process.stderr.write('        Run ~/haraj-scraper/haraj-scraper.js directly.\n')
process.exit(1)
