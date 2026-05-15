'use strict'
// load-soum-gogo.js — ingest soum and gogomotor listings into Supabase
// Does NOT touch existing haraj/syarah/motory listings.
// Run: node scripts/load-soum-gogo.js

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
} catch {}

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jmfoeziomchpwanuziqm.supabase.co'
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
const log = (...a) => process.stderr.write(`[load] ${a.join(' ')}\n`)

const SOUM_FILE  = path.join(__dirname, '..', '..', 'haraj-scraper', 'soum-listings.json')
const GOGO_FILE  = path.join(__dirname, '..', '..', 'haraj-scraper', 'gogomotor-listings.json')

// ── Slug helpers ──────────────────────────────────────────────────────────────
function toSlug(s) {
  if (!s) return null
  return String(s).toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '') || null
}

const FUEL_MAP = {
  petrol: 'petrol', gasoline: 'petrol', بنزين: 'petrol',
  diesel: 'diesel', disel: 'diesel',
  hybrid: 'hybrid', hev: 'hybrid',
  mhev: 'mild-hybrid', 'mild-hybrid': 'mild-hybrid',
  phev: 'plug-in-hybrid',
  ev: 'electric', electric: 'electric',
}
function fuelSlug(raw) {
  if (!raw) return null
  return FUEL_MAP[raw.toLowerCase().replace(/\s+/g, '-')] ?? raw.toLowerCase()
}

const TRANS_MAP = { automatic: 'automatic', auto: 'automatic', manual: 'manual', اوتوماتيك: 'automatic', يدوي: 'manual' }
function transSlug(raw) {
  if (!raw) return null
  return TRANS_MAP[raw.toLowerCase()] ?? raw.toLowerCase()
}

// ── Soum → row ────────────────────────────────────────────────────────────────
function soumToRow(l) {
  return {
    source:            'soum',
    source_url:        l.url ?? null,
    source_id:         l.external_id ?? null,
    make_slug:         toSlug(l.make_en),
    make_en:           l.make_en ?? null,
    make_ar:           null,
    model_slug:        toSlug(l.model_en),
    model_en:          l.model_en ?? null,
    model_ar:          null,
    year:              l.year ?? null,
    price_sar:         l.price_sar ?? null,
    mileage_km:        l.mileage_km ?? null,
    city_slug:         null,
    city_en:           null,
    city_ar:           null,
    color_slug:        null,
    color_en:          null,
    color_ar:          null,
    fuel_type_slug:    null,
    transmission_slug: null,
    body_type_slug:    toSlug(l.body_type),
    condition:         'used',
    trim:              null,
    deal_score:        null,
    deal_score_label:  null,
    score_source:      null,
    score_comparables: null,
    low_price_warning: false,
    contact_for_price: l.price_sar == null,
    is_active:         true,
    seller_type:       'certified',
    title:             l.title ?? null,
    description_ar:    null,
    photo_urls:        Array.isArray(l.photos) && l.photos.length ? l.photos : null,
    scraped_at:        l.scraped_at ?? null,
  }
}

// ── Gogomotor → row ──────────────────────────────────────────────────────────
function gogoToRow(l) {
  return {
    source:            'gogomotor',
    source_url:        l.url ?? null,
    source_id:         l.external_id ?? null,
    make_slug:         toSlug(l.make_en),
    make_en:           l.make_en ?? null,
    make_ar:           null,
    model_slug:        toSlug(l.model_en),
    model_en:          l.model_en ?? null,
    model_ar:          null,
    year:              l.year ?? null,
    price_sar:         l.price_sar ?? null,
    mileage_km:        l.mileage_km ?? null,
    city_slug:         toSlug(l.city_en),
    city_en:           l.city_en ?? null,
    city_ar:           null,
    color_slug:        null,
    color_en:          null,
    color_ar:          null,
    fuel_type_slug:    fuelSlug(l.fuel_type),
    transmission_slug: transSlug(l.transmission),
    body_type_slug:    null,
    condition:         'used',
    trim:              l.trim ?? null,
    deal_score:        null,
    deal_score_label:  null,
    score_source:      null,
    score_comparables: null,
    low_price_warning: false,
    contact_for_price: l.price_sar == null,
    is_active:         true,
    seller_type:       'dealer',
    title:             l.title ?? null,
    description_ar:    null,
    photo_urls:        Array.isArray(l.photos) && l.photos.length ? l.photos : (l.photo && [l.photo]) || null,
    scraped_at:        l.scraped_at ?? null,
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
;(async () => {
  // 1. Load files
  const soumRaw = fs.existsSync(SOUM_FILE)  ? JSON.parse(fs.readFileSync(SOUM_FILE,  'utf8')) : []
  const gogoRaw = fs.existsSync(GOGO_FILE)  ? JSON.parse(fs.readFileSync(GOGO_FILE,  'utf8')) : []
  log(`Soum: ${soumRaw.length} | Gogomotor: ${gogoRaw.length}`)

  const soumRows = soumRaw.map(soumToRow).filter(r => r.make_en && r.model_en)
  const gogoRows = gogoRaw.map(gogoToRow).filter(r => r.make_en && r.model_en)
  log(`After filter: Soum: ${soumRows.length} | Gogomotor: ${gogoRows.length}`)

  // 2. Delete existing soum + gogomotor rows
  for (const src of ['soum', 'gogomotor']) {
    const { error: delErr } = await sb.from('listings').delete().eq('source', src)
    if (delErr) { console.error(`Delete ${src} failed:`, delErr.message); process.exit(1) }
    log(`Deleted existing ${src} rows`)
  }

  // 3. Insert in batches
  const allRows = [...soumRows, ...gogoRows]
  const BATCH = 100
  let inserted = 0

  for (let i = 0; i < allRows.length; i += BATCH) {
    const batch = allRows.slice(i, i + BATCH)
    const { error } = await sb.from('listings').insert(batch)
    if (error) { console.error(`Insert error at ${i}:`, error.message); process.exit(1) }
    inserted += batch.length
    log(`  Inserted ${inserted}/${allRows.length}`)
  }

  console.log('\n══════════════════════════════════════════════')
  console.log(`Inserted:  ${inserted}`)
  console.log(`  Soum:    ${soumRows.length}`)
  console.log(`  GoGoMotor: ${gogoRows.length}`)
  const hasPrice   = allRows.filter(r => r.price_sar).length
  const hasMileage = allRows.filter(r => r.mileage_km).length
  const hasFuel    = allRows.filter(r => r.fuel_type_slug).length
  console.log(`  Price:   ${hasPrice}/${inserted}`)
  console.log(`  Mileage: ${hasMileage}/${inserted}`)
  console.log(`  Fuel:    ${hasFuel}/${inserted}`)
  console.log('══════════════════════════════════════════════')
  console.log('\nNext step: node scripts/ai-valuation.js  (to score new listings)')
})()
