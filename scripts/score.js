'use strict'
// scripts/score.js — Layer 4.
//
// For each active priced listing:
//   1. Look up the (make_slug, model_slug, year, city_slug) baseline.
//      If sample_size >= 5 → statistical score against weighted_median_price.
//      Else → fall through to AI valuation (Claude Haiku).
//   2. ALWAYS re-run red-flag detection (defensive — Layer 2 already wrote
//      red_flags, but we re-check in case the row was inserted by a path
//      that bypassed normalize). Any flag caps the score at 5.0.
//   3. If source_quality_tier >= 2 AND computed score >= 9.0, set
//      low_source_confidence = true (does NOT cap the score).
//   4. Write to deal_score_v2 / score_source_v2 / score_tier_v2 / red_flags
//      / red_flag_penalty / low_source_confidence. Original deal_score stays
//      untouched until the user approves the final swap.
//
// COST GUARD (in-memory): tracks Anthropic spend. Pauses at projected $30
// USD and asks for confirmation via stdin. Reports cache-hit-rate at end.
//
// Usage: node scripts/score.js                      # score everything active
//        node scripts/score.js --where source=haraj # filter
//        node scripts/score.js --limit 100          # cap (testing)
//        node scripts/score.js --no-ai              # baseline-only, skip Claude
//        node scripts/score.js --cost-cap 30        # USD threshold (default 30)
//        node scripts/score.js --auto-continue      # don't prompt at cost cap

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const fs       = require('fs')
const path     = require('path')
const readline = require('readline')

try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.replace(/^export\s+/, '').trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
    }
  }
} catch {}

if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const harajEnv = path.join(__dirname, '..', '..', 'haraj-scraper', '.env')
    if (fs.existsSync(harajEnv)) {
      for (const line of fs.readFileSync(harajEnv, 'utf8').split(/\r?\n/)) {
        const m = line.replace(/^export\s+/, '').trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
        if (m && m[1] === 'ANTHROPIC_API_KEY' && !process.env.ANTHROPIC_API_KEY)
          process.env.ANTHROPIC_API_KEY = m[2].replace(/^['"]|['"]$/g, '').trim()
      }
    }
  } catch {}
}

const { createClient } = require('@supabase/supabase-js')
const bl       = require('../lib/scoring/baseline')
const redflags = require('../lib/scoring/redflags')
const tiers    = require('../lib/scoring/tiers')
const { Valuator } = require('../lib/scoring/ai-valuation')
const { COUNTRY_SCOPE_SENTINEL, SCOPE_CITY, SCOPE_COUNTRY } = require('../lib/scoring/constants')

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY    = process.env.ANTHROPIC_API_KEY
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) { console.error('Missing Supabase env'); process.exit(1) }

const argv = process.argv.slice(2)
const arg  = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null }
const flag = (name) => argv.includes(name)

const LIMIT          = arg('--limit') ? parseInt(arg('--limit'), 10) : null
const WHERE          = arg('--where')         // e.g. "source=haraj"
const COST_CAP_USD   = arg('--cost-cap') ? parseFloat(arg('--cost-cap')) : 30
const NO_AI          = flag('--no-ai')
const AUTO_CONTINUE  = flag('--auto-continue')
const REQUIRE_AI = !NO_AI
if (REQUIRE_AI && !ANTHROPIC_KEY) {
  console.error('Missing ANTHROPIC_API_KEY (or run with --no-ai)'); process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const valuator = REQUIRE_AI ? new Valuator({ anthropicKey: ANTHROPIC_KEY }) : null

const PAGE = 1000
const UPDATE_CONCURRENCY = 15
const AI_CONCURRENCY     = 5
const CHECKPOINT_EVERY   = 100

// ── Helpers ─────────────────────────────────────────────────────────────────
async function prompt (q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(q, ans => { rl.close(); resolve(ans) }))
}

async function loadBaselines () {
  const map = new Map()
  let offset = 0
  for (;;) {
    const { data, error } = await sb
      .from('price_baselines')
      .select('make_slug, model_slug, year, city_slug, scope, sample_size, median_price, weighted_median_price, p25, p75, std_dev')
      .range(offset, offset + PAGE - 1)
    if (error) { console.error('baselines read:', error.message); process.exit(1) }
    if (!data || data.length === 0) break
    for (const r of data) {
      const scope = r.scope ?? SCOPE_CITY
      map.set(`${r.make_slug}|${r.model_slug}|${r.year}|${r.city_slug}|${scope}`, r)
    }
    if (data.length < PAGE) break
    offset += data.length
  }
  return map
}

async function fetchListings () {
  let offset = 0
  const out = []
  for (;;) {
    let q = sb.from('listings')
      .select('id, source, source_quality_tier, make_slug, make_en, make_ar, model_slug, model_en, model_ar, year, price_sar, mileage_km, city_slug, city_en, city_ar, color_slug, color_en, color_ar, fuel_type_slug, transmission_slug, trim, condition, description_ar, title, red_flags, deal_score, score_source')
      .eq('is_active', true)
      .eq('contact_for_price', false)
      .not('price_sar', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)

    if (WHERE) {
      const [col, val] = WHERE.split('=')
      if (col && val) q = q.eq(col, val)
    }

    const { data, error } = await q
    if (error) { console.error('listings read:', error.message); process.exit(1) }
    if (!data || data.length === 0) break
    out.push(...data)
    if (LIMIT && out.length >= LIMIT) { out.length = LIMIT; break }
    if (data.length < PAGE) break
    offset += data.length
  }
  return out
}

// ── Main scoring loop ───────────────────────────────────────────────────────
;(async () => {
  console.log(`Layer 4: score (cost_cap=$${COST_CAP_USD}${NO_AI ? ', NO_AI' : ''})\n`)
  const t0 = Date.now()

  console.log('Loading baselines…')
  const baselines = await loadBaselines()
  console.log(`  ${baselines.size} baselines loaded`)

  console.log('Loading active listings…')
  const listings = await fetchListings()
  console.log(`  ${listings.length} listings to score`)

  if (listings.length === 0) { console.log('Nothing to do.'); return }

  // Partition by available baseline (with city → country fallback).
  const bucket = { city: [], country: [], needsAi: [] }
  const baselineHitsByListing = new Map()
  for (const l of listings) {
    if (!l.source_quality_tier) l.source_quality_tier = tiers.sourceToTier(l.source)
    const hit = bl.lookupBaselineWithFallback(baselines, l, 5)
    if (hit) {
      baselineHitsByListing.set(l.id, hit)
      if (hit.scope === SCOPE_CITY) bucket.city.push(l)
      else                          bucket.country.push(l)
    } else {
      bucket.needsAi.push(l)
    }
  }
  console.log(`  city baseline:    ${bucket.city.length}`)
  console.log(`  country baseline: ${bucket.country.length}`)
  console.log(`  ai path:          ${bucket.needsAi.length}`)

  // ── Phase 1: baseline path (fast, no API calls) ─────────────────────────
  const updates = []
  let costPaused = false

  for (const l of [...bucket.city, ...bucket.country]) {
    const hit = baselineHitsByListing.get(l.id)
    const result = bl.scoreAgainstBaseline(l, hit.baseline, hit.scope)
    if (!result) continue
    updates.push(buildUpdate(l, result))
  }
  console.log(`  baseline-scored: ${updates.length}`)

  // ── Phase 2: AI path (gated by cost guard) ──────────────────────────────
  let aiScored = 0
  if (REQUIRE_AI && bucket.needsAi.length > 0) {
    for (let i = 0; i < bucket.needsAi.length; i += AI_CONCURRENCY) {
      const batch = bucket.needsAi.slice(i, i + AI_CONCURRENCY)
      const results = await Promise.all(batch.map(l => valuator.scoreListing(l).catch(() => null)))
      for (let j = 0; j < batch.length; j++) {
        const r = results[j]
        if (!r) continue
        updates.push(buildUpdate(batch[j], r))
        aiScored++
      }

      // Cost guard check every CHECKPOINT_EVERY
      if (i > 0 && i % CHECKPOINT_EVERY < AI_CONCURRENCY) {
        const processed = Math.min(i + AI_CONCURRENCY, bucket.needsAi.length)
        const remaining = bucket.needsAi.length - processed
        const projected = valuator.projectedSpendForRemaining(processed, remaining)
        const cost = valuator.totalsUsage.cost_usd
        const hits = valuator.totalsUsage.cache_hits_file
        const apis = valuator.totalsUsage.api_calls
        process.stdout.write(`  ai [${processed}/${bucket.needsAi.length}]  cache:${hits}  api:${apis}  spent:$${cost.toFixed(4)}  proj:$${projected.toFixed(2)}\n`)
        valuator.saveCache()

        if (projected > COST_CAP_USD && !costPaused) {
          costPaused = true
          console.log(`\n🛑 COST CAP: projected $${projected.toFixed(2)} exceeds limit $${COST_CAP_USD}`)
          console.log(`   spent so far: $${cost.toFixed(4)} | cache hits: ${hits} | api calls: ${apis}`)
          if (AUTO_CONTINUE) {
            console.log('   --auto-continue is set; continuing.\n')
          } else {
            const ans = await prompt(`   Continue anyway? (y/N) `)
            if (ans.trim().toLowerCase() !== 'y') {
              console.log('   Aborting at user request.')
              break
            }
          }
        }
      }
    }
    valuator.saveCache()
    console.log(`  ai-scored: ${aiScored}`)
  } else if (!REQUIRE_AI) {
    console.log(`  skipped ai path (--no-ai) — ${bucket.needsAi.length} listings remain unscored`)
  }

  // ── Phase 3: write updates ──────────────────────────────────────────────
  console.log(`\nWriting ${updates.length} updates to listings.deal_score_v2…`)
  let written = 0
  const writeErrors = []
  for (let i = 0; i < updates.length; i += UPDATE_CONCURRENCY) {
    const batch = updates.slice(i, i + UPDATE_CONCURRENCY)
    await Promise.all(batch.map(async (u) => {
      const { id, ...patch } = u
      const { error } = await sb.from('listings').update(patch).eq('id', id)
      if (error) writeErrors.push(`${id}: ${error.message}`)
      else written++
    }))
    if (i % 500 < UPDATE_CONCURRENCY) process.stdout.write(`  wrote ${written}/${updates.length}\r`)
  }
  process.stdout.write('\n')
  if (writeErrors.length) {
    console.log(`  write errors: ${writeErrors.length}`)
    for (const e of writeErrors.slice(0, 10)) console.log(`    ${e}`)
  }

  // ── Phase 4: distribution + cost report ─────────────────────────────────
  const dt = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`\nDone in ${dt}s`)
  printDistribution(updates)
  if (REQUIRE_AI) printCostReport(valuator, bucket.needsAi.length)
})().catch(e => { console.error(e); process.exit(1) })

// ── helpers ────────────────────────────────────────────────────────────────
function buildUpdate (listing, result) {
  const flags = redflags.detect(listing)

  // result.deal_score may already have been computed; apply red-flag cap here
  // as the SINGLE source of truth (so behaviour is identical whether scored
  // via baseline or AI).
  const { score: capped, penalty } = redflags.applyCap(result.deal_score, flags)

  const finalScore = capped
  const lowConfidence = (listing.source_quality_tier ?? 3) >= 2 && finalScore >= 9.0

  return {
    id: listing.id,
    deal_score_v2:         finalScore,
    score_source_v2:       result.score_source,
    score_tier_v2:         bl.scoreTier(finalScore),
    baseline_scope:        result.baseline_scope ?? null,
    red_flags:             flags,
    red_flag_penalty:      penalty,
    low_source_confidence: lowConfidence,
  }
}

function printDistribution (updates) {
  const buckets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  const sources = { baseline_statistical: 0, ai_valuation: 0 }
  const scopes  = { city: 0, country: 0, none: 0 }
  let redFlagged = 0, lowConf = 0
  for (const u of updates) {
    const s = u.deal_score_v2
    const idx = Math.min(10, Math.floor(s))
    buckets[idx]++
    sources[u.score_source_v2] = (sources[u.score_source_v2] ?? 0) + 1
    scopes[u.baseline_scope ?? 'none']++
    if ((u.red_flags ?? []).length > 0) redFlagged++
    if (u.low_source_confidence)        lowConf++
  }
  console.log('\n══ Score distribution (deal_score_v2) ══')
  for (let i = 10; i >= 0; i--) {
    const low = i, high = i + 1
    const label = i === 10 ? '10.0' : `${low}.0–${high}.0`
    const pct = updates.length ? ((buckets[i] / updates.length) * 100).toFixed(1) : '0'
    console.log(`  ${label.padEnd(9)} ${buckets[i].toString().padStart(5)}  (${pct}%)`)
  }
  const topTier = buckets[9] + buckets[10]
  console.log(`\n  Top tier ≥9.0: ${topTier} (${updates.length ? ((topTier / updates.length) * 100).toFixed(1) : 0}%)`)
  console.log(`  Red-flagged: ${redFlagged}  |  low_source_confidence: ${lowConf}`)
  console.log('\n══ Score source breakdown ══')
  for (const [k, v] of Object.entries(sources)) console.log(`  ${k.padEnd(22)} ${v}`)
  console.log('\n══ Baseline scope breakdown ══')
  for (const [k, v] of Object.entries(scopes)) console.log(`  ${k.padEnd(10)} ${v}`)
}

function printCostReport (v, totalAi) {
  const u = v.totalsUsage
  const rate = v.cacheHitRate()
  console.log('\n══ Anthropic cost report ══')
  console.log(`  api calls:            ${u.api_calls}`)
  console.log(`  file-cache hits:      ${u.cache_hits_file}`)
  console.log(`  cache hit rate:       ${(rate * 100).toFixed(1)}%`)
  console.log(`  input tokens:         ${u.input_tokens}`)
  console.log(`  cache-creation toks:  ${u.cache_creation_input_tokens}`)
  console.log(`  cache-read tokens:    ${u.cache_read_input_tokens}`)
  console.log(`  output tokens:        ${u.output_tokens}`)
  console.log(`  total spend:          $${u.cost_usd.toFixed(4)}`)
  console.log(`  errors:               ${u.errors}`)
}
