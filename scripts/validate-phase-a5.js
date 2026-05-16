'use strict'
// scripts/validate-phase-a5.js — Phase A.5 validation gate report.
//
// Produces the report required by the refactor v2.5 spec:
//   1. Wreck cases — top 20 worst-offender by description, none > 5.0
//   2. Score distribution (incl pre-refactor compare)
//   3. Baseline coverage by scope
//   4. Score source split (incl external_label, inherited)
//   5. CarSwitch external_price_label validation
//   6. 20 random + top-10 decrease + top-10 increase
//   7. Cost report
//
// STOP after report. No swap.

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

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const REPORT_DIR = path.join(__dirname, '..', 'reports')
fs.mkdirSync(REPORT_DIR, { recursive: true })

const PAGE = 1000

const WRECK_PATTERNS = [
  'side impact', 'side impacts',
  'حادث', 'مصدوم', 'تصادم',
  'airbags deployed', 'airbag deployed',
  'damaged', 'damage',
  'salvage', 'تالف',
  'استمارة منتهية', 'expired registration',
  'محرك معاد', 'engine overhauled', 'overhauled',
  'وفاة', 'توفي', 'ميراث', 'inheritance', 'deceased',
  'fender repair',
]

function descMatchesWreck (text) {
  if (!text) return false
  const lower = text.toLowerCase()
  return WRECK_PATTERNS.some(p => lower.includes(p.toLowerCase()))
}

function excerpt (text, n = 120) {
  if (!text) return ''
  return String(text).replace(/\s+/g, ' ').trim().slice(0, n) + (text.length > n ? '…' : '')
}

;(async () => {
  const lines = []
  const log = (...a) => { const s = a.join(' '); lines.push(s); console.log(s) }

  log('# Phase A.5 Validation Report')
  log(`Generated: ${new Date().toISOString()}`)
  log('')

  // Load all active listings + key fields
  log('Loading listings…')
  let offset = 0
  const all = []
  for (;;) {
    const { data, error } = await sb.from('listings')
      .select('id, source, source_url, source_id, source_quality_tier, make_slug, make_en, model_slug, model_en, year, price_sar, mileage_km, city_slug, description_ar, title, red_flags, red_flag_penalty, deal_score, score_source, deal_score_v2, score_source_v2, score_tier_v2, baseline_scope, external_price_label, market_consensus_score, is_dealer_multi_upload, low_source_confidence')
      .eq('is_active', true)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) { console.error(error.message); process.exit(1) }
    if (!data || data.length === 0) break
    all.push(...data)
    process.stdout.write(`  loaded ${all.length}\r`)
    if (data.length < PAGE) break
    offset += data.length
  }
  process.stdout.write('\n')
  log(`Total active listings: **${all.length}**`)
  log('')

  // ── 1. Wreck cases ─────────────────────────────────────────────────────
  log('## 1. Wreck cases (description matches wreck/damage/accident patterns)')
  log('')
  const wreckCandidates = all.filter(l => {
    const text = `${l.description_ar ?? ''} ${l.title ?? ''}`
    return descMatchesWreck(text) || (l.mileage_km ?? 0) > 300000
  })
  log(`Total wreck-pattern-matching listings: ${wreckCandidates.length}`)
  log('')

  const sorted = [...wreckCandidates]
    .filter(l => l.deal_score_v2 != null)
    .sort((a, b) => b.deal_score_v2 - a.deal_score_v2)
  log('Top 20 by deal_score_v2 (highest = worst — any > 5.0 means red-flag detection failed):')
  log('')
  log('| # | id | source | yr/make/model | price | mileage | new_score | red_flags | desc excerpt |')
  log('|---|---|---|---|---:|---:|---:|---|---|')
  let wreckPass = true
  for (let i = 0; i < Math.min(20, sorted.length); i++) {
    const l = sorted[i]
    const score = l.deal_score_v2 ?? '—'
    if (typeof score === 'number' && score > 5.0) wreckPass = false
    log(`| ${i + 1} | ${l.id.slice(0, 8)} | ${l.source} | ${l.year} ${l.make_en ?? l.make_slug}/${l.model_en ?? l.model_slug} | ${l.price_sar?.toLocaleString() ?? '—'} | ${(l.mileage_km ?? 0).toLocaleString()} | **${score}** | ${(l.red_flags ?? []).join(', ') || '—'} | ${excerpt(l.description_ar, 80)} |`)
  }
  log('')
  log(`**Gate: top wreck score ≤ 5.0** — ${wreckPass ? '✓ PASS' : '✗ FAIL'}`)
  log('')

  // ── 2. Score distribution ─────────────────────────────────────────────
  log('## 2. Score distribution (deal_score_v2 vs deal_score)')
  log('')
  const histV1 = new Array(11).fill(0)
  const histV2 = new Array(11).fill(0)
  let nullV1 = 0, nullV2 = 0
  for (const l of all) {
    if (l.deal_score == null) nullV1++; else histV1[Math.min(10, Math.floor(l.deal_score))]++
    if (l.deal_score_v2 == null) nullV2++; else histV2[Math.min(10, Math.floor(l.deal_score_v2))]++
  }
  log('| bucket | v1 count | v1 % | v2 count | v2 % |')
  log('|---|---:|---:|---:|---:|')
  const denomV1 = all.length - nullV1
  const denomV2 = all.length - nullV2
  for (let i = 10; i >= 0; i--) {
    const lbl = i === 10 ? '10.0' : `${i}.0–${i + 1}.0`
    log(`| ${lbl} | ${histV1[i]} | ${denomV1 ? ((histV1[i] / denomV1) * 100).toFixed(1) : 0}% | ${histV2[i]} | ${denomV2 ? ((histV2[i] / denomV2) * 100).toFixed(1) : 0}% |`)
  }
  log(`| null | ${nullV1} | — | ${nullV2} | — |`)
  log('')
  const topV1Pct = ((histV1[9] + histV1[10]) / Math.max(1, denomV1)) * 100
  const topV2Pct = ((histV2[9] + histV2[10]) / Math.max(1, denomV2)) * 100
  log(`Top tier ≥9.0: v1 ${histV1[9] + histV1[10]} (${topV1Pct.toFixed(1)}%) → v2 ${histV2[9] + histV2[10]} (${topV2Pct.toFixed(1)}%)`)
  const distPass = topV2Pct < 10
  log(`**Gate: top tier ≥9.0 < 10% (v2)** — ${distPass ? '✓ PASS' : '✗ FAIL'}`)
  log('')

  // ── 3. Baseline coverage ──────────────────────────────────────────────
  log('## 3. Baseline coverage')
  log('')
  const { data: baselines } = await sb.from('price_baselines').select('make_slug, scope, sample_size')
  const cityBaselines = (baselines ?? []).filter(b => b.scope === 'city' && b.sample_size >= 5)
  const countryBaselines = (baselines ?? []).filter(b => b.scope === 'country' && b.sample_size >= 5)
  log(`- Total baselines with sample_size >= 5: **${cityBaselines.length + countryBaselines.length}**`)
  log(`  - city scope:    ${cityBaselines.length}`)
  log(`  - country scope: ${countryBaselines.length}`)
  log(`- Phase A baseline count was 27 → now ${cityBaselines.length + countryBaselines.length} (**${((cityBaselines.length + countryBaselines.length) / 27).toFixed(1)}× growth**)`)
  log('')
  // Top makes
  const byMake = new Map()
  for (const b of [...cityBaselines, ...countryBaselines]) byMake.set(b.make_slug, (byMake.get(b.make_slug) ?? 0) + 1)
  log('Top 10 makes by baseline count:')
  log('')
  log('| make | baselines |')
  log('|---|---:|')
  for (const [m, c] of [...byMake.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) log(`| ${m} | ${c} |`)
  log('')

  // ── 4. Score source split ─────────────────────────────────────────────
  log('## 4. Score source split (score_source_v2)')
  log('')
  const bySrc = {}
  for (const l of all) {
    const s = l.score_source_v2 ?? 'unscored'
    bySrc[s] = (bySrc[s] ?? 0) + 1
  }
  log('| source | count | % |')
  log('|---|---:|---:|')
  for (const [s, c] of Object.entries(bySrc).sort((a, b) => b[1] - a[1])) {
    log(`| ${s} | ${c} | ${((c / all.length) * 100).toFixed(1)}% |`)
  }
  log('')

  // ── 5. CarSwitch external_price_label validation ─────────────────────
  log('## 5. CarSwitch external_price_label validation')
  log('')
  const carSwitch = all.filter(l => l.source === 'carswitch')
  const csWithLabel = carSwitch.filter(l => l.external_price_label)
  log(`CarSwitch listings: ${carSwitch.length}`)
  log(`  with external_price_label: ${csWithLabel.length} (${((csWithLabel.length / carSwitch.length) * 100).toFixed(1)}%)`)
  log('')
  // Cross-tab: their label vs our score_tier_v2
  const tabLabel = {}
  for (const l of csWithLabel) {
    const ourTier = l.score_tier_v2 ?? 'unscored'
    const theirLabel = l.external_price_label
    tabLabel[theirLabel] = tabLabel[theirLabel] ?? {}
    tabLabel[theirLabel][ourTier] = (tabLabel[theirLabel][ourTier] ?? 0) + 1
  }
  log('Cross-tab (their label × our tier):')
  log('')
  log('| label | great_deal | good_deal | fair | overpriced | very_overpriced | total |')
  log('|---|---:|---:|---:|---:|---:|---:|')
  for (const [lbl, tiers] of Object.entries(tabLabel)) {
    const r = ['great_deal', 'good_deal', 'fair', 'overpriced', 'very_overpriced']
    const counts = r.map(t => tiers[t] ?? 0)
    const total = counts.reduce((s, c) => s + c, 0)
    log(`| ${lbl} | ${counts.join(' | ')} | ${total} |`)
  }
  log('')

  // ── 6. Sample comparisons ─────────────────────────────────────────────
  log('## 6. Sample comparisons')
  log('')
  log('### 20 random listings (old vs new score)')
  log('')
  const sampled = all.filter(l => l.deal_score != null && l.deal_score_v2 != null).sort(() => Math.random() - 0.5).slice(0, 20)
  log('| id | source | yr/make/model | price | old | new | Δ |')
  log('|---|---|---|---:|---:|---:|---:|')
  for (const l of sampled) {
    const d = l.deal_score_v2 - l.deal_score
    log(`| ${l.id.slice(0, 8)} | ${l.source} | ${l.year} ${l.make_en ?? l.make_slug}/${l.model_en ?? l.model_slug} | ${l.price_sar?.toLocaleString() ?? '—'} | ${l.deal_score} | ${l.deal_score_v2} | ${d > 0 ? '+' : ''}${d.toFixed(1)} |`)
  }
  log('')

  const both = all.filter(l => l.deal_score != null && l.deal_score_v2 != null).map(l => ({ ...l, _delta: l.deal_score_v2 - l.deal_score }))
  log('### Top 10 score DECREASES (red-flag corrections / over-priced detections)')
  log('')
  log('| id | source | yr/make/model | price | old | new | Δ | red_flags | desc |')
  log('|---|---|---|---:|---:|---:|---:|---|---|')
  for (const l of [...both].sort((a, b) => a._delta - b._delta).slice(0, 10)) {
    log(`| ${l.id.slice(0, 8)} | ${l.source} | ${l.year} ${l.make_en ?? l.make_slug}/${l.model_en ?? l.model_slug} | ${l.price_sar?.toLocaleString() ?? '—'} | ${l.deal_score} | ${l.deal_score_v2} | ${l._delta.toFixed(1)} | ${(l.red_flags ?? []).join(', ') || '—'} | ${excerpt(l.description_ar, 80)} |`)
  }
  log('')
  log('### Top 10 score INCREASES (clean cars whose comps cleaned up)')
  log('')
  log('| id | source | yr/make/model | price | old | new | Δ | red_flags | desc |')
  log('|---|---|---|---:|---:|---:|---:|---|---|')
  for (const l of [...both].sort((a, b) => b._delta - a._delta).slice(0, 10)) {
    log(`| ${l.id.slice(0, 8)} | ${l.source} | ${l.year} ${l.make_en ?? l.make_slug}/${l.model_en ?? l.model_slug} | ${l.price_sar?.toLocaleString() ?? '—'} | ${l.deal_score} | ${l.deal_score_v2} | +${l._delta.toFixed(1)} | ${(l.red_flags ?? []).join(', ') || '—'} | ${excerpt(l.description_ar, 80)} |`)
  }
  log('')

  // ── 7. Cost report ────────────────────────────────────────────────────
  log('## 7. Cost report')
  log('')
  log('From scripts/score.js run logs (logs/score-optimized.log):')
  log('')
  log('| metric | value |')
  log('|---|---:|')
  log(`| total Anthropic spend | $2.27 |`)
  log(`| API calls | 2,011 |`)
  log(`| file-cache hits | 3,606 |`)
  log(`| cache hit rate | 64.2% |`)
  log(`| input tokens | 1,590,133 |`)
  log(`| output tokens | 135,455 |`)
  log(`| AI errors (parse) | 3 |`)
  log(`| listings scored per $1 | ${Math.round(14895 / 2.27).toLocaleString()} |`)
  log(`| cost per listing | $${(2.27 / 14895).toFixed(5)} |`)
  log('')
  log('Pre-optimization baseline (previous run): $0.16 on 2,400 AI calls = 95.7% cache hit')
  log('This run: $2.27 on 2,011 API calls = 64.2% cache hit (lower because dataset is mostly new listings; cache had to be populated)')
  log('')
  log('Anthropic prompt-caching (`cache_control: ephemeral`) showed 0 reads/writes — the static system prompt at ~600 tokens is below Anthropic Haiku\'s 1,024-token minimum for prompt caching to activate. Cost is still under target ($2.27 < $5 ceiling), driven by the file cache + payload trimming + multi-upload inheritance.')
  log('')

  // ── Summary ───────────────────────────────────────────────────────────
  log('## Summary')
  log('')
  log(`| gate | result |`)
  log(`|---|---|`)
  log(`| Wreck cases ≤ 5.0 | ${wreckPass ? '✓ PASS' : '✗ FAIL'} |`)
  log(`| Top tier ≥9.0 < 10% | ${distPass ? '✓ PASS' : '✗ FAIL'} (${topV2Pct.toFixed(1)}%) |`)
  log(`| Baselines ≥5 samples | ${cityBaselines.length + countryBaselines.length} (vs 27 in Phase A) |`)
  log(`| Total scored | ${all.length - nullV2} / ${all.length} (${((1 - nullV2 / all.length) * 100).toFixed(1)}%) |`)
  log(`| Cost | $2.27 |`)
  log('')

  const reportPath = path.join(REPORT_DIR, `phase-a5-validation-${new Date().toISOString().replace(/[:.]/g, '-')}.md`)
  fs.writeFileSync(reportPath, lines.join('\n'))
  console.log(`\nReport saved: ${reportPath}`)
})().catch(e => { console.error(e); process.exit(1) })
