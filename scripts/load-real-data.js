'use strict'
// TLS workaround — same flag the Next.js dev server uses
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

// scripts/load-real-data.js
// Merges haraj-listings-normalized.json + syarah-listings.json,
// computes deal scores, inserts into Supabase listings table.
//
// Requires: SUPABASE_SERVICE_ROLE_KEY in car-aggregator/.env.local
// Run from car-aggregator/: node scripts/load-real-data.js

const path  = require('path')
const fs    = require('fs')

// Load env from .env.local in the project root
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.replace(/^export\s+/, '').trim()
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) {
      // Only set if not already in shell environment
      process.env[m[1]] = m[2].replace(/^['"]/, '').replace(/['"]$/, '').trim()
    }
  }
}

const { createClient } = require('@supabase/supabase-js')

// Known URL from test-db.mjs as hard fallback
const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jmfoeziomchpwanuziqm.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY. Add to car-aggregator/.env.local:')
  console.error('  SUPABASE_SERVICE_ROLE_KEY=eyJ...   ← Supabase → Settings → API → service_role')
  process.exit(1)
}

const log = (...a) => process.stderr.write(`[load] ${a.join(' ')}\n`)

log(`Supabase URL: ${SUPABASE_URL}`)
log(`Service key:  ${SERVICE_ROLE_KEY.slice(0, 20)}…`)

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const HARAJ_FILE  = path.join(__dirname, '..', '..', 'haraj-scraper', 'haraj-listings-normalized.json')
const SYARAH_FILE = path.join(__dirname, '..', '..', 'haraj-scraper', 'syarah-listings.json')

// ── Deal score computation ────────────────────────────────────────────────────

function median(arr) {
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

function scoreFromRatio(ratio) {
  // ratio = (price - median) / median; negative = cheaper
  if (ratio < -0.15) return Math.min(10, 9 + Math.min(1, (-ratio - 0.15) / 0.15))
  if (ratio < -0.05) return 7 + ((-ratio - 0.05) / 0.10) * 2
  if (ratio <=  0.05) return 7 - ((ratio + 0.05) / 0.10) * 2
  if (ratio <=  0.15) return 5 - ((ratio - 0.05) / 0.10) * 2
  return Math.max(0, 3 - Math.min(3, ((ratio - 0.15) / 0.15) * 3))
}

function labelFromRatio(ratio) {
  if (ratio < -0.15) return 'صفقة ممتازة'
  if (ratio < -0.05) return 'صفقة جيدة'
  if (ratio <=  0.05) return 'سعر عادل'
  if (ratio <=  0.15) return 'سعر مرتفع'
  return 'سعر مبالغ فيه'
}

function computeDealScores(rows) {
  // Group by make_slug + model_slug + year (priced only)
  const groups = {}
  for (const r of rows) {
    if (!r.price_sar || !r.make_slug || !r.model_slug || !r.year) continue
    const key = `${r.make_slug}|${r.model_slug}|${r.year}`
    if (!groups[key]) groups[key] = []
    groups[key].push(r)
  }

  let scored = 0, pending = 0

  for (const group of Object.values(groups)) {
    if (group.length < 5) { pending += group.length; continue }

    const med = median(group.map(r => r.price_sar))
    for (const r of group) {
      const ratio = (r.price_sar - med) / med
      let score = scoreFromRatio(ratio)

      if (ratio < -0.5) {
        score = Math.min(score, 7)
        r.low_price_warning = true
      }

      r.deal_score       = Math.round(score * 10) / 10
      r.deal_score_label = labelFromRatio(ratio)
      scored++
    }
  }

  // Count no-price listings separately
  const noPriceCount = rows.filter(r => !r.price_sar).length
  return { scored, pending, noPriceCount }
}

// ── Row normalisation ─────────────────────────────────────────────────────────

function harajToRow(l) {
  return {
    source:            'haraj',
    source_url:        l.url ?? null,
    source_id:         null,
    make_slug:         l.make_slug ?? null,
    make_en:           l.make_en   ?? l.make ?? null,
    make_ar:           l.make_ar   ?? null,
    model_slug:        l.model_slug ?? null,
    model_en:          l.model_en   ?? l.model ?? null,
    model_ar:          l.model_ar   ?? null,
    year:              l.year       ?? null,
    price_sar:         l.price      ?? null,
    mileage_km:        l.mileage_km ?? null,
    city_slug:         l.city_slug  ?? null,
    city_en:           l.city_en    ?? l.city ?? null,
    city_ar:           l.city_ar    ?? null,
    color_slug:        l.color_slug ?? null,
    color_en:          l.color_en   ?? l.color ?? null,
    color_ar:          l.color_ar   ?? null,
    fuel_type_slug:    l.fuel_type_slug ?? null,
    transmission_slug: l.transmission_slug ?? null,
    body_type_slug:    l.body_type_slug ?? null,
    condition:         'used',
    trim:              l.trim ?? null,
    deal_score:        null,
    deal_score_label:  null,
    low_price_warning: false,
    contact_for_price: l.price == null,
    is_active:         true,
    seller_type:       'private',
    title:             l.title ?? null,
    description_ar:    l.description ?? null,
    photo_urls:        Array.isArray(l.photo_urls) ? l.photo_urls : null,
    scraped_at:        l.scraped_at ?? null,
  }
}

function syarahToRow(l) {
  return {
    source:            'syarah',
    source_url:        l.url ?? null,
    source_id:         l.id  ?? null,
    make_slug:         l.make_slug ?? null,
    make_en:           l.make_en   ?? null,
    make_ar:           l.make_ar   ?? null,
    model_slug:        l.model_slug ?? null,
    model_en:          l.model_en   ?? null,
    model_ar:          l.model_ar   ?? null,
    year:              l.year       ?? null,
    price_sar:         l.price_sar  ?? null,
    mileage_km:        l.mileage_km ?? null,
    city_slug:         l.city_slug  ?? null,
    city_en:           l.city_en    ?? l.city ?? null,
    city_ar:           l.city_ar    ?? null,
    color_slug:        l.color_slug ?? null,
    color_en:          l.color_en   ?? null,
    color_ar:          l.color_ar   ?? null,
    fuel_type_slug:    l.fuel_type_slug ?? null,
    transmission_slug: l.transmission_slug ?? null,
    body_type_slug:    l.body_type_slug ?? null,
    condition:         l.condition  ?? 'used',
    trim:              l.trim ?? null,
    deal_score:        null,
    deal_score_label:  null,
    low_price_warning: false,
    contact_for_price: l.price_sar == null,
    is_active:         true,
    seller_type:       'private',
    title:             l.title ?? null,
    description_ar:    null,
    photo_urls:        Array.isArray(l.photo_urls) ? l.photo_urls : null,
    scraped_at:        l.scraped_at ?? null,
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
;(async () => {
  // 1. Load raw data
  log('Loading data files…')
  const harajRaw  = JSON.parse(fs.readFileSync(HARAJ_FILE,  'utf8'))
  const syarahRaw = JSON.parse(fs.readFileSync(SYARAH_FILE, 'utf8'))
  log(`  Haraj:  ${harajRaw.length} listings`)
  log(`  Syarah: ${syarahRaw.length} listings`)

  const rows = [
    ...harajRaw.map(harajToRow),
    ...syarahRaw.map(syarahToRow),
  ]
  log(`  Merged: ${rows.length} rows`)

  // 2. Compute deal scores
  log('Computing deal scores…')
  const { scored, pending, noPriceCount } = computeDealScores(rows)
  log(`  Scored: ${scored} | Pending (group < 5): ${pending} | No price: ${noPriceCount}`)

  // 3. Delete all existing rows
  log('Deleting existing listings…')
  const { error: delErr } = await supabase
    .from('listings')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // deletes all rows
  if (delErr) {
    console.error('Delete failed:', delErr.message)
    console.error('Did you run supabase/migrate-v2.sql in the Supabase SQL editor?')
    process.exit(1)
  }
  log('  Done.')

  // 4. Insert in batches of 200
  const BATCH = 200
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error: insErr } = await supabase.from('listings').insert(batch)
    if (insErr) {
      console.error(`Insert error at row ${i}:`, insErr.message)
      process.exit(1)
    }
    inserted += batch.length
    log(`  Inserted ${inserted}/${rows.length}`)
  }

  // 5. Report
  const harajCount  = rows.filter(r => r.source === 'haraj').length
  const syarahCount = rows.filter(r => r.source === 'syarah').length

  process.stdout.write('\n')
  process.stdout.write('══════════════════════════════════════════════════\n')
  process.stdout.write(`Total inserted: ${rows.length}\n`)
  process.stdout.write(`  Haraj:  ${harajCount}\n`)
  process.stdout.write(`  Syarah: ${syarahCount}\n`)
  process.stdout.write(`Deal scores:\n`)
  process.stdout.write(`  Scored (real score):      ${scored}\n`)
  process.stdout.write(`  Pending (group < 5):      ${pending}\n`)
  process.stdout.write(`  No price (contact only):  ${noPriceCount}\n`)
  process.stdout.write('══════════════════════════════════════════════════\n')
})()
