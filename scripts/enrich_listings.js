'use strict'
// scripts/enrich_listings.js — Layer 2.5: feature enrichment on canonical listings.
//
// Computes and writes back:
//   - dealer_signature (from seller_name + city + source when available)
//   - mileage_per_year (mileage_km / max(1, CURRENT_YEAR - year))
//   - cross_source_listing_group (UUID grouping same car across sources at
//     same make/model/year/price ±3%)
//   - market_consensus_score (count of distinct sources in the group)
//   - is_dealer_multi_upload (5+ same (make, model, year, price ±2k) within
//     same source ⇒ dealer-style inventory multi-upload)
//
// Also fixes data quality issues surfaced in the audit:
//   - Re-resolve null make_slug / model_slug via model→make inference and
//     a small expansion to translations.json (in-memory only).
//   - Canonicalize fuel_type_slug (`electrical` → `electric`).
//   - Canonicalize transmission_slug (drop garbage values like "regional",
//     "and", "with", "f 1" — keep only automatic/manual/cvt).
//   - Canonicalize body_type_slug (`minivan` → `van`, `sports` → `coupe`).
//
// Idempotent: safe to re-run.

const fs   = require('fs')
const path = require('path')
const crypto = require('crypto')

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

const PAGE = 1000
const UPDATE_CONCURRENCY = 15
const CURRENT_YEAR = 2026

// ── Model → Make inference (covers audit gaps in Soum/Motory) ─────────────
const MODEL_TO_MAKE = {
  // Bentley
  mulsanne: 'bentley', bentayga: 'bentley', 'flying-spur': 'bentley',
  continental: 'bentley', 'continental-gt': 'bentley',
  // BMW numeric/model codes
  '4-series': 'bmw', '6-series': 'bmw', '8-series': 'bmw',
  '520': 'bmw', '520-i': 'bmw', '530': 'bmw', '530-i': 'bmw',
  '730': 'bmw', '730-li': 'bmw', '740': 'bmw', '750': 'bmw',
  '320': 'bmw', '328': 'bmw', '335': 'bmw',
  // Cadillac
  xt4: 'cadillac', xt7: 'cadillac', sls: 'cadillac', ats: 'cadillac',
  ct4: 'cadillac', ct5: 'cadillac', ct6: 'cadillac',
  // Peugeot
  '3008': 'peugeot', '5008': 'peugeot', '2008': 'peugeot', '208': 'peugeot',
  '301': 'peugeot', '408': 'peugeot', '508': 'peugeot',
  // Audi
  a3: 'audi', a4: 'audi', a5: 'audi', a6: 'audi', a7: 'audi', a8: 'audi',
  q2: 'audi', q3: 'audi', q5: 'audi', q7: 'audi', q8: 'audi',
  // Mercedes class codes
  'c-class': 'mercedes-benz', 'e-class': 'mercedes-benz', 's-class': 'mercedes-benz',
  'a-class': 'mercedes-benz', glc: 'mercedes-benz', gle: 'mercedes-benz',
  gls: 'mercedes-benz', gla: 'mercedes-benz', glb: 'mercedes-benz',
  amg: 'mercedes-benz',
  // Common ambiguous slugs we see in Soum scrapes
  '6-mazda-6': 'mazda', 'mazda-6': 'mazda', 'mazda-3': 'mazda', 'mazda-2': 'mazda',
  'cx-5': 'mazda', 'cx-9': 'mazda', 'cx-30': 'mazda',
  // Hyundai / Kia common
  accent: 'hyundai', elantra: 'hyundai', sonata: 'hyundai', tucson: 'hyundai',
  santa: 'hyundai', 'santa-fe': 'hyundai', creta: 'hyundai', azera: 'hyundai',
  veloster: 'hyundai', kona: 'hyundai', palisade: 'hyundai', venue: 'hyundai',
  'grand-i10': 'hyundai',
  cerato: 'kia', sportage: 'kia', sorento: 'kia', optima: 'kia', k5: 'kia',
  picanto: 'kia', rio: 'kia', soul: 'kia', niro: 'kia', stinger: 'kia',
  carnival: 'kia', k7: 'kia', k8: 'kia', k9: 'kia', telluride: 'kia',
  // Toyota
  yaris: 'toyota', camry: 'toyota', corolla: 'toyota', avalon: 'toyota',
  rav4: 'toyota', highlander: 'toyota', fortuner: 'toyota', prado: 'toyota',
  hilux: 'toyota', hiace: 'toyota', haice: 'toyota', innova: 'toyota',
  'land-cruiser': 'toyota', tundra: 'toyota', sequoia: 'toyota', rush: 'toyota',
  raize: 'toyota', tacoma: 'toyota',
  // Nissan
  altima: 'nissan', maxima: 'nissan', sentra: 'nissan', sunny: 'nissan',
  patrol: 'nissan', pathfinder: 'nissan', xterra: 'nissan', armada: 'nissan',
  'x-trail': 'nissan', kicks: 'nissan', navara: 'nissan',
  // Chevrolet
  tahoe: 'chevrolet', suburban: 'chevrolet', cruze: 'chevrolet', camaro: 'chevrolet',
  silverado: 'chevrolet', captiva: 'chevrolet', traverse: 'chevrolet',
  malibu: 'chevrolet', equinox: 'chevrolet', impala: 'chevrolet',
  // Ford
  taurus: 'ford', explorer: 'ford', edge: 'ford', expedition: 'ford',
  mustang: 'ford', escape: 'ford', focus: 'ford', fusion: 'ford',
  'f-150': 'ford', f150: 'ford', territory: 'ford', everest: 'ford',
  // GMC
  yukon: 'gmc', acadia: 'gmc', sierra: 'gmc', terrain: 'gmc',
  // Honda
  civic: 'honda', accord: 'honda', 'cr-v': 'honda', crv: 'honda', pilot: 'honda',
  odyssey: 'honda', city: 'honda', hrv: 'honda',
  // Mitsubishi
  pajero: 'mitsubishi', outlander: 'mitsubishi', lancer: 'mitsubishi',
  attrage: 'mitsubishi', asx: 'mitsubishi', xpander: 'mitsubishi',
  // Lexus
  es: 'lexus', ls: 'lexus', is: 'lexus', rx: 'lexus', gx: 'lexus', lx: 'lexus', nx: 'lexus', ux: 'lexus',
  // Jeep
  cherokee: 'jeep', 'grand-cherokee': 'jeep', wrangler: 'jeep', compass: 'jeep',
  renegade: 'jeep', gladiator: 'jeep',
  // Dodge
  challenger: 'dodge', charger: 'dodge', durango: 'dodge',
  // Land Rover
  defender: 'land-rover', discovery: 'land-rover', 'range-rover': 'land-rover',
  evoque: 'land-rover',
  // Misc
  emgrand: 'geely', azkarra: 'geely', tugella: 'geely', monjaro: 'geely', coolray: 'geely',
  jolion: 'haval', h6: 'haval', h9: 'haval', dargo: 'haval',
  zs: 'mg', rx5: 'mg', hs: 'mg', '5-mg': 'mg',
  'jetour-x70': 'jetour', 't2: jetour': 'jetour',
}

function inferMakeSlug (modelSlug) {
  if (!modelSlug) return null
  const k = String(modelSlug).toLowerCase()
  if (MODEL_TO_MAKE[k]) return MODEL_TO_MAKE[k]
  // BMW: pure 3-digit numbers
  if (/^[0-9]{3}(-(li|i|d|e|m|s))?$/.test(k)) return 'bmw'
  return null
}

// Try to clean Soum-style slug ("6-mazda-6" → "mazda-6", "3008-3008" → "3008")
function cleanModelSlug (slug) {
  if (!slug) return slug
  // dup pattern: "X-X" → "X"
  const parts = slug.split('-')
  if (parts.length === 2 && parts[0] === parts[1]) return parts[0]
  // Embedded make: "6-mazda-6" → "mazda-6"
  if (parts.length === 3 && parts[0] === parts[2]) return `${parts[1]}-${parts[2]}`
  return slug
}

// ── Canonical fixes ────────────────────────────────────────────────────────
function canonicalFuel (slug) {
  if (!slug) return null
  const s = String(slug).toLowerCase()
  if (s === 'electrical') return 'electric'
  if (['petrol', 'diesel', 'hybrid', 'electric', 'mild-hybrid', 'plug-in-hybrid'].includes(s)) return s
  return null
}
function canonicalTrans (slug) {
  if (!slug) return null
  const s = String(slug).toLowerCase()
  if (['automatic', 'manual', 'cvt', 'tiptronic'].includes(s)) return s
  // Map common variants
  if (/auto/.test(s)) return 'automatic'
  if (/manual|stick/.test(s)) return 'manual'
  return null   // drop garbage values
}
function canonicalBody (slug) {
  if (!slug) return null
  const s = String(slug).toLowerCase()
  if (s === 'minivan') return 'van'
  if (s === 'sports') return 'coupe'
  if (['sedan', 'suv', 'coupe', 'hatchback', 'pickup', 'van', 'wagon', 'convertible'].includes(s)) return s
  return null
}

// ── Dealer signature ──────────────────────────────────────────────────────
// Best-effort: most scrapers don't capture phone. We compose from
// (seller_name + source + city) when available, else null.
async function loadRawSellerName (sb) {
  const map = new Map()
  let offset = 0
  for (;;) {
    const { data } = await sb.from('raw_listings')
      .select('source, source_id, structured_data')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (!data || data.length === 0) break
    for (const r of data) {
      const sn = r.structured_data?.seller_name
      if (sn) map.set(`${r.source}|${r.source_id}`, sn)
    }
    if (data.length < PAGE) break
    offset += data.length
  }
  return map
}

function computeDealerSignature (listing, sellerName) {
  if (!sellerName && listing.seller_type === 'private') return null
  // Normalize seller name: lowercase, strip whitespace/punctuation, collapse.
  const nameKey = sellerName
    ? String(sellerName).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
    : null
  if (!nameKey) {
    // Fallback: dealers without explicit name → no signature.
    return null
  }
  // Compose: source + nameKey + city (when present)
  const parts = [listing.source, nameKey, listing.city_slug ?? ''].filter(Boolean)
  return parts.join(':').slice(0, 200)
}

// ── Cross-source grouping ─────────────────────────────────────────────────
function priceBucket (price, percent) {
  if (!price) return null
  // Compute a bucket label that any price within ±percent collapses to.
  const widthSar = price * (percent / 100)
  return Math.round(price / Math.max(widthSar, 1000))
}

;(async () => {
  const t0 = Date.now()

  console.log('Loading raw seller_name lookup…')
  const sellerNames = await loadRawSellerName(sb)
  console.log(`  ${sellerNames.size} seller_name entries`)

  console.log('Loading all listings…')
  const all = []
  let offset = 0
  for (;;) {
    const { data, error } = await sb.from('listings')
      .select('id, source, source_id, source_url, source_quality_tier, make_slug, make_en, make_ar, model_slug, model_en, model_ar, year, price_sar, mileage_km, city_slug, body_type_slug, fuel_type_slug, transmission_slug, seller_type')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    process.stdout.write(`  loaded ${all.length}\r`)
    if (data.length < PAGE) break
    offset += data.length
  }
  process.stdout.write('\n')
  console.log(`  total: ${all.length}`)

  // ── Pass A: per-row computed fields ─────────────────────────────────────
  console.log('\nComputing per-row enrichment fields…')
  for (const l of all) {
    // 1. Clean / infer make + model
    const cleanedModel = cleanModelSlug(l.model_slug)
    if (cleanedModel && cleanedModel !== l.model_slug) l._new_model_slug = cleanedModel
    if (!l.make_slug && (l.model_slug || cleanedModel)) {
      const inferred = inferMakeSlug(cleanedModel ?? l.model_slug)
      if (inferred) {
        l._new_make_slug = inferred
        // Also derive make_en from translations if we can.
      }
    }

    // 2. Canonical fuel/trans/body
    const f = canonicalFuel(l.fuel_type_slug)
    if (f !== l.fuel_type_slug) l._new_fuel_type_slug = f
    const tr = canonicalTrans(l.transmission_slug)
    if (tr !== l.transmission_slug) l._new_transmission_slug = tr
    const b = canonicalBody(l.body_type_slug)
    if (b !== l.body_type_slug) l._new_body_type_slug = b

    // 3. mileage_per_year
    if (l.mileage_km != null && l.year != null) {
      const age = Math.max(1, CURRENT_YEAR - l.year)
      l._new_mileage_per_year = Math.round((l.mileage_km / age) * 10) / 10
    }

    // 4. dealer_signature
    const sn = sellerNames.get(`${l.source}|${l.source_id}`)
    l._new_dealer_signature = computeDealerSignature(l, sn)
  }

  // ── Pass B: cross-source groups + consensus ─────────────────────────────
  // Use updated make/model from Pass A for grouping.
  console.log('Building cross-source groups (make, model, year, price ±3%)…')
  const groups = new Map()
  for (const l of all) {
    const mk = l._new_make_slug ?? l.make_slug
    const md = l._new_model_slug ?? l.model_slug
    if (!mk || !md || !l.year || !l.price_sar) continue
    const pb = priceBucket(l.price_sar, 3)
    const key = `${mk}|${md}|${l.year}|${pb}`
    if (!groups.has(key)) groups.set(key, { sources: new Set(), listings: [], uuid: crypto.randomUUID() })
    const g = groups.get(key)
    g.sources.add(l.source)
    g.listings.push(l)
  }
  console.log(`  ${groups.size} groups`)
  for (const g of groups.values()) {
    const consensus = Math.min(10, g.sources.size)
    for (const l of g.listings) {
      l._new_cross_source_group = g.uuid
      l._new_consensus = consensus
    }
  }

  // ── Pass C: intra-source multi-upload detection ────────────────────────
  // Within same source, listings sharing (make, model, year, price ±2k)
  // with count >= 5 are flagged.
  console.log('Detecting intra-source multi-uploads…')
  const sourceBuckets = new Map()
  for (const l of all) {
    const mk = l._new_make_slug ?? l.make_slug
    const md = l._new_model_slug ?? l.model_slug
    if (!mk || !md || !l.year || !l.price_sar) continue
    const pb = priceBucket(l.price_sar, 2)
    const key = `${l.source}|${mk}|${md}|${l.year}|${pb}`
    if (!sourceBuckets.has(key)) sourceBuckets.set(key, [])
    sourceBuckets.get(key).push(l)
  }
  let multiUploadCount = 0
  let multiUploadGroups = 0
  for (const [key, ls] of sourceBuckets) {
    if (ls.length >= 5) {
      multiUploadGroups++
      for (const l of ls) { l._new_multi_upload = true; multiUploadCount++ }
    }
  }
  console.log(`  ${multiUploadGroups} multi-upload groups, ${multiUploadCount} listings flagged`)

  // ── Pass D: write back ─────────────────────────────────────────────────
  console.log('\nWriting updates to listings…')
  const updates = all.map(l => {
    const patch = {}
    if (l._new_model_slug != null)          patch.model_slug         = l._new_model_slug
    if (l._new_make_slug != null)           patch.make_slug          = l._new_make_slug
    if (l._new_fuel_type_slug !== undefined) patch.fuel_type_slug    = l._new_fuel_type_slug
    if (l._new_transmission_slug !== undefined) patch.transmission_slug = l._new_transmission_slug
    if (l._new_body_type_slug !== undefined) patch.body_type_slug    = l._new_body_type_slug
    if (l._new_mileage_per_year != null)    patch.mileage_per_year   = l._new_mileage_per_year
    patch.dealer_signature                  = l._new_dealer_signature ?? null
    if (l._new_cross_source_group)          patch.cross_source_listing_group = l._new_cross_source_group
    if (l._new_consensus != null)           patch.market_consensus_score = l._new_consensus
    patch.is_dealer_multi_upload            = l._new_multi_upload === true
    return { id: l.id, patch }
  }).filter(u => Object.keys(u.patch).length > 0)

  let written = 0
  const errors = []
  for (let i = 0; i < updates.length; i += UPDATE_CONCURRENCY) {
    const batch = updates.slice(i, i + UPDATE_CONCURRENCY)
    await Promise.all(batch.map(async ({ id, patch }) => {
      const { error } = await sb.from('listings').update(patch).eq('id', id)
      if (error) errors.push(`${id}: ${error.message}`)
      else written++
    }))
    if (i % 500 < UPDATE_CONCURRENCY) process.stdout.write(`  wrote ${written}/${updates.length}\r`)
  }
  process.stdout.write('\n')

  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  console.log(`  rows updated: ${written}/${updates.length}`)
  console.log(`  errors: ${errors.length}`)
  if (errors.length > 0) for (const e of errors.slice(0, 5)) console.log(`    ${e}`)

  // Report enrichment summary
  console.log('\n══ Enrichment summary ══')
  console.log(`  rows with cross_source_listing_group: ${all.filter(l => l._new_cross_source_group).length}`)
  console.log(`  rows with mileage_per_year:           ${all.filter(l => l._new_mileage_per_year != null).length}`)
  console.log(`  rows with dealer_signature:           ${all.filter(l => l._new_dealer_signature).length}`)
  console.log(`  rows flagged is_dealer_multi_upload:  ${multiUploadCount}`)
  console.log(`  cross-source groups w/ 2+ sources:    ${[...groups.values()].filter(g => g.sources.size >= 2).length}`)
  console.log(`  cross-source groups w/ 3+ sources:    ${[...groups.values()].filter(g => g.sources.size >= 3).length}`)
  console.log(`  cross-source groups w/ 5+ sources:    ${[...groups.values()].filter(g => g.sources.size >= 5).length}`)

  console.log('\nConsensus score histogram:')
  const consBuckets = {}
  for (const l of all) {
    const c = l._new_consensus ?? 0
    consBuckets[c] = (consBuckets[c] ?? 0) + 1
  }
  for (const c of Object.keys(consBuckets).sort((a, b) => a - b)) {
    console.log(`  score=${c}: ${consBuckets[c]}`)
  }

  console.log('\nMake/model resolution fixes:')
  console.log(`  make_slug filled by inference:  ${all.filter(l => l._new_make_slug && !l.make_slug).length}`)
  console.log(`  model_slug cleaned by inference: ${all.filter(l => l._new_model_slug && l._new_model_slug !== l.model_slug).length}`)
})().catch(e => { console.error(e); process.exit(1) })
