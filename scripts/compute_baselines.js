'use strict'
// scripts/compute_baselines.js — Layer 3.
//
// For every (make_slug, model_slug, year, city_slug) group in the canonical
// listings table with >= 5 priced samples, compute statistics and upsert into
// price_baselines:
//   - median_price            (unweighted)
//   - weighted_median_price   (tier-weighted; Tier 1 x3, Tier 2 x2, Tier 3 x1)
//   - p25, p75, std_dev
//   - sample_size
//
// Scoring (Layer 4) reads weighted_median_price as the reference price.
//
// Idempotent. Re-running fully replaces the price_baselines table.
//
// Usage: node scripts/compute_baselines.js
//        node scripts/compute_baselines.js --min-samples 3   # default 5

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const fs   = require('fs')
const path = require('path')

try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.replace(/^export\s+/, '').trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
    }
  }
} catch {}

const { createClient } = require('@supabase/supabase-js')
const bl    = require('../lib/scoring/baseline')
const tiers = require('../lib/scoring/tiers')

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1)
}
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Parse --min-samples N
const MIN_SAMPLES = (() => {
  const i = process.argv.indexOf('--min-samples')
  if (i >= 0 && process.argv[i + 1]) return parseInt(process.argv[i + 1], 10) || 5
  return 5
})()

const PAGE = 1000
const UPSERT_BATCH = 500

;(async () => {
  console.log(`Layer 3: compute_baselines (min_samples=${MIN_SAMPLES})\n`)
  const t0 = Date.now()

  // 1. Read all active priced listings with make/model/year/city.
  let offset = 0
  const all = []
  for (;;) {
    const { data, error } = await sb
      .from('listings')
      .select('make_slug, model_slug, year, city_slug, price_sar, source, source_quality_tier')
      .eq('is_active', true)
      .eq('contact_for_price', false)
      .not('price_sar', 'is', null)
      .not('make_slug', 'is', null)
      .not('model_slug', 'is', null)
      .not('year', 'is', null)
      .not('city_slug', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) { console.error('read:', error.message); process.exit(1) }
    if (!data || data.length === 0) break
    all.push(...data)
    process.stdout.write(`  read ${all.length}\r`)
    if (data.length < PAGE) break
    offset += data.length
  }
  process.stdout.write('\n')
  console.log(`  total priced+keyed listings: ${all.length}`)

  // 2. Bucket by (make, model, year, city).
  const buckets = new Map()
  for (const r of all) {
    if (!r.source_quality_tier) r.source_quality_tier = tiers.sourceToTier(r.source)
    const key = `${r.make_slug}|${r.model_slug}|${r.year}|${r.city_slug}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(r)
  }
  console.log(`  unique (make, model, year, city) groups: ${buckets.size}`)

  // 3. Compute baseline rows.
  const rows = []
  let qualified = 0
  for (const [key, groupListings] of buckets) {
    const baseline = bl.computeBaseline(groupListings, { minSamples: MIN_SAMPLES })
    if (!baseline) continue
    qualified++
    const [make_slug, model_slug, yearStr, city_slug] = key.split('|')
    rows.push({
      make_slug,
      model_slug,
      year: parseInt(yearStr, 10),
      city_slug,
      ...baseline,
      last_computed: new Date().toISOString(),
    })
  }
  console.log(`  groups with >= ${MIN_SAMPLES} samples: ${qualified}`)

  // 4. Replace price_baselines table (delete + insert in batches).
  // Use DELETE WHERE TRUE — simplest. Re-insert is fast.
  const { error: delErr } = await sb.from('price_baselines').delete().neq('make_slug', '__never_match__')
  if (delErr) { console.error('delete failed:', delErr.message); process.exit(1) }

  let inserted = 0
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH)
    const { error: insErr } = await sb.from('price_baselines').insert(batch)
    if (insErr) { console.error(`insert at ${i}:`, insErr.message); process.exit(1) }
    inserted += batch.length
    process.stdout.write(`  inserted ${inserted}/${rows.length}\r`)
  }
  process.stdout.write('\n')

  // 5. Distribution report.
  const samplesDist = { '5-9': 0, '10-19': 0, '20-49': 0, '50+': 0 }
  const byMake = new Map()
  for (const r of rows) {
    if (r.sample_size < 10)      samplesDist['5-9']++
    else if (r.sample_size < 20) samplesDist['10-19']++
    else if (r.sample_size < 50) samplesDist['20-49']++
    else                          samplesDist['50+']++
    byMake.set(r.make_slug, (byMake.get(r.make_slug) ?? 0) + 1)
  }

  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  console.log('\nbaseline sample-size distribution:')
  for (const [k, v] of Object.entries(samplesDist)) console.log(`  ${k.padEnd(8)} ${v}`)

  console.log('\ntop 10 makes by baseline count:')
  const topMakes = [...byMake.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  for (const [m, c] of topMakes) console.log(`  ${m.padEnd(15)} ${c}`)

  // Total active listings vs total baseline-covered
  console.log(`\nbaselines: ${qualified} groups | ${all.length} total active priced listings`)
})().catch(e => { console.error(e); process.exit(1) })
