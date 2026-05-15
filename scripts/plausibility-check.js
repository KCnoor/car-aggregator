'use strict'
// scripts/plausibility-check.js
// Fixes Saudi shorthand number parsing for Haraj listings in Supabase.
//
// Saudi sellers commonly write:
//   "77 KM"  → mileage parsed as 77 instead of 77,000
//   "300 KM" → 300 instead of 300,000
//   "4"      → price 4,000 SAR (rare, but happens)
//
// Three-pass approach:
//   Pass 1: Heuristic auto-fix  (clear cases, no API)
//   Pass 2: Haiku plausibility  (ambiguous cases, API)
//   Pass 3: Re-score all corrected listings
//
// Run: node scripts/plausibility-check.js

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const path = require('path')
const fs   = require('fs')

// Load env
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.replace(/^export\s+/, '').trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
  }
} catch { /* ignore */ }

if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const harajEnv = path.join(__dirname, '..', '..', 'haraj-scraper', '.env')
    for (const line of fs.readFileSync(harajEnv, 'utf8').split(/\r?\n/)) {
      const m = line.replace(/^export\s+/, '').trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && m[1] === 'ANTHROPIC_API_KEY' && !process.env.ANTHROPIC_API_KEY)
        process.env.ANTHROPIC_API_KEY = m[2].replace(/^['"]|['"]$/g, '').trim()
    }
  } catch { /* ignore */ }
}

const https = require('https')
const { createClient } = require('@supabase/supabase-js')

const CURRENT_YEAR = new Date().getFullYear()
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

async function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 250,
      messages: [{ role: 'user', content: prompt }],
    })
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      rejectUnauthorized: false,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jmfoeziomchpwanuziqm.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// ── Pass 1: heuristic rules ────────────────────────────────────────────────────

function heuristicFix(listing) {
  const changes = {}
  const year = listing.year ?? 0

  // Mileage shorthand: "77 KM" → 77 km stored, should be 77,000
  // Rule: mileage < 500 AND (car is older than 2 years OR mileage < 200)
  // A brand-new 2024 car genuinely might have 26 km. A 2012 car with 228 km is impossible.
  const mile = listing.mileage_km
  if (mile != null && mile > 0 && mile < 500) {
    const carAge = CURRENT_YEAR - year
    // Old car (>2 yrs): any mileage < 500 must be shorthand
    if (carAge > 2 && mile < 500) {
      changes.mileage_km = mile * 1000
      changes.mileage_fix = 'auto_×1000'
    }
    // New car (<= 2 yrs): mileage < 10 is fine; 10-499 is ambiguous
    else if (carAge <= 2 && mile >= 10 && mile < 500) {
      changes.mileage_ambiguous = true
    }
  }

  // Price shorthand: price < 1000 must be shorthand (no car costs under 1000 SAR)
  const price = listing.price_sar
  if (price != null && price > 0 && price < 1000) {
    changes.price_sar = price * 1000
    changes.price_fix = 'auto_×1000'
  }
  // Price 1000–4999 for any car is suspicious (minimum plausible is ~5000 SAR for very old cars)
  else if (price != null && price >= 1000 && price < 5000) {
    changes.price_ambiguous = true
  }

  return changes
}

// ── Pass 2: Haiku plausibility check ──────────────────────────────────────────

async function haikusPlausibility(listing, needsCheck) {
  const makeModel = `${listing.make_en ?? listing.make_ar ?? '?'} ${listing.model_en ?? listing.model_ar ?? '?'}`
  const desc = (listing.description_ar ?? '').slice(0, 600)

  const lines = []
  if (needsCheck.mileage) lines.push(`- Mileage stored: ${listing.mileage_km} km (suspicious — may be shorthand for ${listing.mileage_km * 1000} km)`)
  if (needsCheck.price)   lines.push(`- Price stored: ${listing.price_sar} SAR (suspicious — may be shorthand for ${listing.price_sar * 1000} SAR)`)

  const prompt =
    `You are a Saudi car listing data quality expert.\n` +
    `Check whether the structured numbers match what is actually written in the description.\n\n` +
    `Car: ${makeModel}, Year: ${listing.year ?? '?'}\n` +
    `${lines.join('\n')}\n` +
    `Description (Arabic/English):\n${desc}\n\n` +
    `In Saudi listings, "77 KM" means 77,000 km. "300" for mileage means 300,000 km. "37" for price can mean 37,000 SAR.\n` +
    `Return JSON only:\n` +
    `{"mileage_correction_needed":bool,"suggested_mileage":number_or_null,"price_correction_needed":bool,"suggested_price":number_or_null,"confidence":"low|medium|high","reasoning":"brief"}`

  try {
    const msg = await callClaude(prompt)
    const text = (msg.content?.[0]?.text ?? '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    return JSON.parse(text)
  } catch (e) {
    process.stderr.write(`[haiku] Error for ${listing.id}: ${e.message?.slice(0, 80)}\n`)
    return null
  }
}

// ── Score refresh using existing scoring logic ─────────────────────────────────

function mileageBucket(km) {
  if (!km || km <= 0) return 'unknown'
  if (km < 25000)  return '0-25k'
  if (km < 50000)  return '25-50k'
  if (km < 75000)  return '50-75k'
  if (km < 100000) return '75-100k'
  if (km < 150000) return '100-150k'
  return '150k+'
}

// Reload the valuation cache to re-score
function loadValuationCache() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'ai-valuation-cache.json'), 'utf8'))
  } catch { return {} }
}

function scoreFromRatio(ratio) {
  if (ratio < -0.50) return 10.0
  if (ratio < -0.30) return 9.0 + ((-ratio - 0.30) / 0.20) * 1.0
  if (ratio < -0.18) return 8.0 + ((-ratio - 0.18) / 0.12) * 1.0
  if (ratio < -0.08) return 6.5 + ((-ratio - 0.08) / 0.10) * 1.5
  if (ratio <=  0.00) return 5.5 + ((-ratio) / 0.08) * 1.0
  if (ratio <=  0.08) return 4.5 + (1 - ratio / 0.08) * 1.0
  if (ratio <=  0.18) return 3.0 + (1 - (ratio - 0.08) / 0.10) * 1.5
  return Math.max(0, 3.0 - Math.min(3.0, ((ratio - 0.18) / 0.30) * 3.0))
}

function labelFromScore(s) {
  if (s >= 9) return 'صفقة ممتازة'
  if (s >= 7) return 'صفقة جيدة'
  if (s >= 5) return 'سعر عادل'
  if (s >= 3) return 'سعر مرتفع'
  return 'سعر مبالغ فيه'
}

const RED_FLAG_PATTERNS = [
  /حادث|مصدوم|تصادم/,
  /airbag|air\s*bag/i,
  /محرك\s*معاد|محرك\s*مجدد|overhauled/i,
  /استمارة\s*منتهية?|expired\s*reg/i,
  /تأمين\s*منتهي|expired\s*ins/i,
  /وفاة|توفي|متوفي|ورث|ميراث|inherit/i,
  /\bdamage[d]?\b/i,
  /salvage/i,
]

function hasRedFlags(listing) {
  const text = (listing.description_ar ?? '') + ' ' + (listing.title ?? '')
  return RED_FLAG_PATTERNS.some(r => r.test(text)) || (listing.mileage_km ?? 0) > 300000
}

function reScore(listing, cache) {
  const key = [
    listing.make_slug || listing.make_en || 'unknown',
    listing.model_slug || listing.model_en || 'unknown',
    listing.year || 'unknown',
    mileageBucket(listing.mileage_km),
    listing.city_slug || listing.city_en || 'unknown',
  ].join('|')

  const aiResult = cache[key]
  if (!aiResult?.estimated_fair_price_sar) return null

  const fair = aiResult.estimated_fair_price_sar
  const ratio = (listing.price_sar - fair) / fair
  let score = scoreFromRatio(ratio)
  if (aiResult.confidence === 'low') score = score * 0.5 + 5.0 * 0.5
  score = Math.round(score * 10) / 10
  if (hasRedFlags(listing)) score = Math.min(score, 5.0)
  const lowPriceWarning = ratio < -0.50 || (hasRedFlags(listing) && ratio < -0.20)

  return { deal_score: score, deal_score_label: labelFromScore(score), low_price_warning: lowPriceWarning }
}

// ── Main ──────────────────────────────────────────────────────────────────────

;(async () => {
  console.log('Fetching all Haraj listings from DB…')
  const { data: listings, error } = await sb
    .from('listings')
    .select('id, source, make_slug, make_en, make_ar, model_slug, model_en, model_ar, year, price_sar, mileage_km, city_slug, city_en, city_ar, description_ar, title, deal_score')
    .eq('source', 'haraj')
    .eq('is_active', true)

  if (error) { console.error(error.message); process.exit(1) }
  console.log(`Loaded ${listings.length} Haraj listings\n`)

  const autoMileageFixes   = []
  const autoPriceFixes     = []
  const ambiguousMileage   = []
  const ambiguousPrice     = []
  const dataQualityWarning = []

  // ── Pass 1: heuristic ────────────────────────────────────────────────────
  console.log('Pass 1: Heuristic auto-correction…')
  const dbUpdates = []

  for (const l of listings) {
    const h = heuristicFix(l)

    const update = { id: l.id }
    let changed = false

    if (h.mileage_km) {
      update.mileage_km = h.mileage_km
      autoMileageFixes.push({ id: l.id, before: l.mileage_km, after: h.mileage_km, make: l.make_en, model: l.model_en, year: l.year })
      changed = true
    }
    if (h.price_sar) {
      update.price_sar = h.price_sar
      autoPriceFixes.push({ id: l.id, before: l.price_sar, after: h.price_sar, make: l.make_en, model: l.model_en, year: l.year })
      changed = true
    }
    if (h.mileage_ambiguous) ambiguousMileage.push(l)
    if (h.price_ambiguous)   ambiguousPrice.push(l)
    if (changed) dbUpdates.push(update)
  }

  // Apply heuristic fixes to DB
  let heuristicApplied = 0
  for (const u of dbUpdates) {
    const { id, ...fields } = u
    const { error: e } = await sb.from('listings').update(fields).eq('id', id)
    if (e) process.stderr.write(`[db] ${id}: ${e.message}\n`)
    else heuristicApplied++
  }
  console.log(`  Auto-fixed: ${autoMileageFixes.length} mileages, ${autoPriceFixes.length} prices → ${heuristicApplied} DB updates`)

  // ── Pass 2: Haiku on ambiguous cases ─────────────────────────────────────
  const ambiguous = [...new Set([...ambiguousMileage, ...ambiguousPrice])]
  console.log(`\nPass 2: Haiku plausibility on ${ambiguous.length} ambiguous listings…`)

  const CONCURRENCY = 3
  let haikusApplied = 0

  for (let i = 0; i < ambiguous.length; i += CONCURRENCY) {
    const batch = ambiguous.slice(i, i + CONCURRENCY)
    await Promise.all(batch.map(async (l) => {
      const needsCheck = {
        mileage: ambiguousMileage.includes(l),
        price:   ambiguousPrice.includes(l),
      }
      const result = await haikusPlausibility(l, needsCheck)
      if (!result) { dataQualityWarning.push(l.id); return }

      const update = {}
      let corrected = false

      if (result.mileage_correction_needed && result.suggested_mileage && result.confidence !== 'low') {
        update.mileage_km = result.suggested_mileage
        corrected = true
      }
      if (result.price_correction_needed && result.suggested_price && result.confidence !== 'low') {
        update.price_sar = result.suggested_price
        corrected = true
      }
      if (result.confidence === 'low') {
        dataQualityWarning.push(l.id)
      }

      if (corrected) {
        const { error: e } = await sb.from('listings').update(update).eq('id', l.id)
        if (!e) haikusApplied++
      }
    }))
    if ((i + CONCURRENCY) % 15 === 0 || i + CONCURRENCY >= ambiguous.length) {
      process.stdout.write(`  [${Math.min(i + CONCURRENCY, ambiguous.length)}/${ambiguous.length}] haiku checks done\n`)
    }
  }
  console.log(`  Haiku corrections applied: ${haikusApplied} | Data quality warnings: ${dataQualityWarning.length}`)

  // ── Pass 3: Re-score all corrected listings ───────────────────────────────
  const correctedIds = new Set([
    ...autoMileageFixes.map(x => x.id),
    ...autoPriceFixes.map(x => x.id),
    // We don't know which ambiguous ones were corrected by Haiku, re-score them all
    ...ambiguous.map(l => l.id),
  ])

  console.log(`\nPass 3: Re-scoring ${correctedIds.size} corrected listings…`)

  // Re-fetch corrected listings (updated values)
  const { data: corrected } = await sb
    .from('listings')
    .select('id, make_slug, make_en, make_ar, model_slug, model_en, model_ar, year, price_sar, mileage_km, city_slug, city_en, city_ar, description_ar, title')
    .in('id', [...correctedIds])
    .eq('is_active', true)
    .eq('contact_for_price', false)
    .not('price_sar', 'is', null)

  const valCache = loadValuationCache()
  let rescored = 0
  for (const l of (corrected ?? [])) {
    const s = reScore(l, valCache)
    if (!s) continue
    const { error: e } = await sb.from('listings').update({
      deal_score:        s.deal_score,
      deal_score_label:  s.deal_score_label,
      low_price_warning: s.low_price_warning,
    }).eq('id', l.id)
    if (!e) rescored++
  }
  console.log(`  Re-scored: ${rescored} listings`)

  // ── Report ────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════')
  console.log('PLAUSIBILITY CHECK RESULTS')
  console.log('══════════════════════════════════════════════════════')
  console.log(`Mileage auto-corrected (×1000):  ${autoMileageFixes.length}`)
  console.log(`Price auto-corrected (×1000):    ${autoPriceFixes.length}`)
  console.log(`Haiku corrections applied:       ${haikusApplied}`)
  console.log(`Data quality warnings added:     ${dataQualityWarning.length}`)
  console.log(`Listings re-scored:              ${rescored}`)
  console.log('\nSample mileage corrections (before → after):')
  autoMileageFixes.slice(0, 3).forEach(x =>
    console.log(`  ${x.make} ${x.model} ${x.year}: ${x.before} km → ${x.after.toLocaleString()} km`)
  )
  console.log('\nSample price corrections (before → after):')
  autoPriceFixes.slice(0, 3).forEach(x =>
    console.log(`  ${x.make} ${x.model} ${x.year}: ${x.before} SAR → ${x.after.toLocaleString()} SAR`)
  )
  console.log('══════════════════════════════════════════════════════')
})()
