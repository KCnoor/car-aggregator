'use strict'
// load-new-sources.js — ingest carly, yallamotor, saudisale listings into Supabase
// Run: node scripts/load-new-sources.js

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const path = require('path')
const fs   = require('fs')

try {
  const envPath = path.join(__dirname, '..', '.env.local')
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.replace(/^export\s+/, '').trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
  }
} catch {}

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jmfoeziomchpwanuziqm.supabase.co'
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const sb  = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
const log = (...a) => process.stderr.write(`[load] ${a.join(' ')}\n`)

const SCRAPER_DIR = path.join(__dirname, '..', '..', 'haraj-scraper')

function toSlug(s) {
  if (!s) return null
  return String(s).toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '') || null
}

const FUEL_MAP = {
  petrol: 'petrol', gasoline: 'petrol', بنزين: 'petrol',
  diesel: 'diesel', disel: 'diesel',
  hybrid: 'hybrid', hev: 'hybrid',
  electric: 'electric', ev: 'electric',
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

function toRow(l, sellerType) {
  return {
    source:            l.source,
    source_url:        l.url ?? null,
    source_id:         l.external_id ? String(l.external_id) : null,
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
    color_slug:        toSlug(l.color_en),
    color_en:          l.color_en ?? null,
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
    seller_type:       sellerType,
    title:             l.title ?? null,
    description_ar:    null,
    photo_urls:        Array.isArray(l.photos) && l.photos.length ? l.photos : null,
    scraped_at:        l.scraped_at ?? null,
  }
}

;(async () => {
  const sources = [
    { name: 'carly',      file: 'carly-listings.json',      sellerType: 'certified' },
    { name: 'yallamotor', file: 'yallamotor-listings.json', sellerType: 'individual' },
    { name: 'saudisale',  file: 'saudisale-listings.json',  sellerType: 'individual' },
  ]

  let totalInserted = 0
  const summary = []

  for (const { name, file, sellerType } of sources) {
    const filePath = path.join(SCRAPER_DIR, file)
    if (!fs.existsSync(filePath)) { log(`Skip ${name}: file not found`); continue }

    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const rows = raw.map(l => toRow(l, sellerType)).filter(r => r.make_en && r.model_en && r.price_sar)
    log(`${name}: ${raw.length} raw → ${rows.length} valid rows`)

    // Delete existing rows for this source
    const { error: delErr } = await sb.from('listings').delete().eq('source', name)
    if (delErr) { console.error(`Delete ${name} failed:`, delErr.message); process.exit(1) }
    log(`Deleted existing ${name} rows`)

    // Insert in batches
    const BATCH = 100
    let inserted = 0
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      const { error } = await sb.from('listings').insert(batch)
      if (error) { console.error(`Insert ${name} at ${i}:`, error.message); process.exit(1) }
      inserted += batch.length
    }
    log(`  Inserted ${inserted} ${name} rows`)
    totalInserted += inserted
    summary.push({ name, inserted, price: rows.filter(r => r.price_sar).length, mileage: rows.filter(r => r.mileage_km).length, fuel: rows.filter(r => r.fuel_type_slug).length })
  }

  console.log('\n══════════════════════════════════════════════')
  console.log(`Total inserted: ${totalInserted}`)
  for (const s of summary) {
    console.log(`  ${s.name}: ${s.inserted}  price:${s.price}  mileage:${s.mileage}  fuel:${s.fuel}`)
  }
  console.log('══════════════════════════════════════════════')
  console.log('\nNext: cd car-aggregator && node scripts/ai-valuation.js')
})()
