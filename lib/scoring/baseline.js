'use strict'
// Statistical scoring + percentile helpers. Pure functions.
//
// scoreFromRatio + labelFromScore are the canonical scoring curve, lifted
// verbatim from the previous scripts/ai-valuation.js. They're used by BOTH
// the statistical (baseline) path and the AI valuation path so the two
// engines produce comparable scores.

const { tierWeight } = require('./tiers')
const { COUNTRY_SCOPE_SENTINEL, SCOPE_CITY, SCOPE_COUNTRY } = require('./constants')

// ── Score curve ─────────────────────────────────────────────────────────────
// ratio = (listing.price - reference_price) / reference_price.
// Negative ratio (under-priced) → high score; positive (over-priced) → low.
function scoreFromRatio (ratio) {
  if (ratio < -0.50) return 10.0
  if (ratio < -0.30) return 9.0 + ((-ratio - 0.30) / 0.20) * 1.0   // 9.0–10.0
  if (ratio < -0.18) return 8.0 + ((-ratio - 0.18) / 0.12) * 1.0   // 8.0–9.0
  if (ratio < -0.08) return 6.5 + ((-ratio - 0.08) / 0.10) * 1.5   // 6.5–8.0
  if (ratio <=  0.00) return 5.5 + ((-ratio) / 0.08) * 1.0          // 5.5–6.5
  if (ratio <=  0.08) return 4.5 + (1 - ratio / 0.08) * 1.0         // 4.5–5.5
  if (ratio <=  0.18) return 3.0 + (1 - (ratio - 0.08) / 0.10) * 1.5 // 3.0–4.5
  return Math.max(0, 3.0 - Math.min(3.0, ((ratio - 0.18) / 0.30) * 3.0))
}

function labelFromScore (score) {
  if (score >= 9) return 'صفقة ممتازة'
  if (score >= 7) return 'صفقة جيدة'
  if (score >= 5) return 'سعر عادل'
  if (score >= 3) return 'سعر مرتفع'
  return 'سعر مبالغ فيه'
}

function scoreTier (score) {
  if (score >= 9)   return 'great_deal'
  if (score >= 7.5) return 'good_deal'
  if (score >= 5.5) return 'fair'
  if (score >= 3.5) return 'overpriced'
  return 'very_overpriced'
}

// ── Percentile + weighted median (used by compute_baselines.js) ─────────────
// Given an array of {price, weight}, returns the weighted median price.
// Weights are integers — implemented as sample expansion (simple, correct).
function weightedMedian (samples) {
  if (!samples || samples.length === 0) return null
  const expanded = []
  for (const s of samples) {
    const w = Math.max(1, s.weight | 0)
    for (let i = 0; i < w; i++) expanded.push(s.price)
  }
  expanded.sort((a, b) => a - b)
  const n = expanded.length
  return n % 2 === 1 ? expanded[(n - 1) >> 1] : (expanded[n / 2 - 1] + expanded[n / 2]) / 2
}

function median (numbers) {
  if (!numbers || numbers.length === 0) return null
  const s = [...numbers].sort((a, b) => a - b)
  const n = s.length
  return n % 2 === 1 ? s[(n - 1) >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2
}

function percentile (numbers, p) {
  if (!numbers || numbers.length === 0) return null
  const s = [...numbers].sort((a, b) => a - b)
  const idx = Math.max(0, Math.min(s.length - 1, Math.floor((s.length - 1) * p)))
  return s[idx]
}

function stdDev (numbers) {
  if (!numbers || numbers.length < 2) return null
  const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length
  const variance = numbers.reduce((a, b) => a + (b - mean) ** 2, 0) / (numbers.length - 1)
  return Math.sqrt(variance)
}

// ── Compute a baseline row from listings ────────────────────────────────────
// listings = array of { price_sar, source } for one (make, model, year, city).
// Returns null if fewer than minSamples (default 5) priced listings.
function computeBaseline (listings, opts = {}) {
  const minSamples = opts.minSamples ?? 5
  const priced = listings.filter(l => l.price_sar != null && l.price_sar > 0)
  if (priced.length < minSamples) return null

  const prices = priced.map(l => l.price_sar)
  const weightedSamples = priced.map(l => ({ price: l.price_sar, weight: tierWeight(l.source_quality_tier ?? 3) }))

  return {
    sample_size:            priced.length,
    median_price:           median(prices),
    weighted_median_price:  weightedMedian(weightedSamples),
    p25:                    percentile(prices, 0.25),
    p75:                    percentile(prices, 0.75),
    std_dev:                stdDev(prices),
  }
}

// ── Score a single listing against a baseline ───────────────────────────────
// Optional `scope` is one of SCOPE_CITY / SCOPE_COUNTRY; forwarded to caller
// for forensic visibility (written to listings.baseline_scope).
function scoreAgainstBaseline (listing, baseline, scope = SCOPE_CITY) {
  if (!baseline || baseline.weighted_median_price == null) return null
  if (listing.price_sar == null || listing.price_sar <= 0) return null
  const ref = baseline.weighted_median_price
  const ratio = (listing.price_sar - ref) / ref
  const raw = scoreFromRatio(ratio)
  const score = Math.round(raw * 10) / 10
  return {
    deal_score: score,
    score_source: 'baseline_statistical',
    score_tier: scoreTier(score),
    score_comparables: baseline.sample_size,
    baseline_scope: scope,
    reference_price: ref,
    ratio,
  }
}

// ── Baseline lookup with scope fallback ─────────────────────────────────────
// Given a Map keyed by `${make}|${model}|${year}|${city_or_sentinel}|${scope}`,
// try the city scope first; fall back to country. Returns { baseline, scope }
// or null if neither qualifies.
function lookupBaselineWithFallback (baselineMap, listing, minSamples = 5) {
  const m = listing.make_slug, mo = listing.model_slug, y = listing.year, c = listing.city_slug
  if (!m || !mo || !y) return null

  if (c) {
    const cityKey = `${m}|${mo}|${y}|${c}|${SCOPE_CITY}`
    const cityB = baselineMap.get(cityKey)
    if (cityB && cityB.sample_size >= minSamples) return { baseline: cityB, scope: SCOPE_CITY }
  }

  const countryKey = `${m}|${mo}|${y}|${COUNTRY_SCOPE_SENTINEL}|${SCOPE_COUNTRY}`
  const countryB = baselineMap.get(countryKey)
  if (countryB && countryB.sample_size >= minSamples) return { baseline: countryB, scope: SCOPE_COUNTRY }

  return null
}

module.exports = {
  scoreFromRatio,
  labelFromScore,
  scoreTier,
  weightedMedian,
  median,
  percentile,
  stdDev,
  computeBaseline,
  scoreAgainstBaseline,
  lookupBaselineWithFallback,
}
