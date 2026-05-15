'use strict'
// Normalization helpers used by Layer 2 (normalize.js) and by the AI valuation
// cache key. Pure functions only — no I/O.

const CURRENT_YEAR = new Date().getFullYear()

// ── Slug helpers ────────────────────────────────────────────────────────────
function toSlug (s) {
  if (!s) return null
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || null
}

const FUEL_MAP = {
  petrol: 'petrol', gasoline: 'petrol', بنزين: 'petrol',
  diesel: 'diesel', disel: 'diesel', ديزل: 'diesel',
  hybrid: 'hybrid', hev: 'hybrid', هايبرد: 'hybrid',
  mhev: 'mild-hybrid', 'mild-hybrid': 'mild-hybrid',
  phev: 'plug-in-hybrid', 'plug-in-hybrid': 'plug-in-hybrid',
  ev: 'electric', electric: 'electric', كهربائي: 'electric',
}
function fuelSlug (raw) {
  if (!raw) return null
  const k = String(raw).toLowerCase().replace(/\s+/g, '-')
  return FUEL_MAP[k] ?? k
}

const TRANS_MAP = {
  automatic: 'automatic', auto: 'automatic', اوتوماتيك: 'automatic', أوتوماتيك: 'automatic',
  manual: 'manual', يدوي: 'manual', عادي: 'manual',
}
function transSlug (raw) {
  if (!raw) return null
  return TRANS_MAP[String(raw).toLowerCase().trim()] ?? String(raw).toLowerCase().trim()
}

// ── Mileage bucketization (used by AI valuation cache key) ──────────────────
function mileageBucket (km) {
  if (!km || km <= 0) return 'unknown'
  if (km < 25000)  return '0-25k'
  if (km < 50000)  return '25-50k'
  if (km < 75000)  return '50-75k'
  if (km < 100000) return '75-100k'
  if (km < 150000) return '100-150k'
  return '150k+'
}

// ── Saudi-shorthand fixes (the "77 KM = 77,000 km" problem) ────────────────
// Returns { mileage_km?, price_sar?, mileage_fix?, price_fix?, mileage_ambiguous?, price_ambiguous? }
// Heuristic rules only — ambiguous cases get flagged for AI inspection downstream.
function heuristicShorthandFix (listing) {
  const out = {}
  const year = listing.year ?? 0
  const age = year > 0 ? CURRENT_YEAR - year : 0

  const mile = listing.mileage_km
  if (mile != null && mile > 0 && mile < 500) {
    if (age > 2) {
      out.mileage_km = mile * 1000
      out.mileage_fix = 'auto_×1000'
    } else if (mile >= 10) {
      out.mileage_ambiguous = true
    }
  }

  const price = listing.price_sar
  if (price != null && price > 0 && price < 1000) {
    out.price_sar = price * 1000
    out.price_fix = 'auto_×1000'
  } else if (price != null && price >= 1000 && price < 5000) {
    out.price_ambiguous = true
  }

  return out
}

// ── AI valuation cache key (preserves existing cache contents) ─────────────
function valuationCacheKey (listing) {
  return [
    listing.make_slug  || listing.make_en  || 'unknown',
    listing.model_slug || listing.model_en || 'unknown',
    listing.year       || 'unknown',
    mileageBucket(listing.mileage_km),
    listing.city_slug  || listing.city_en  || 'unknown',
  ].join('|')
}

module.exports = {
  CURRENT_YEAR,
  toSlug,
  fuelSlug,
  transSlug,
  FUEL_MAP,
  TRANS_MAP,
  mileageBucket,
  heuristicShorthandFix,
  valuationCacheKey,
}
