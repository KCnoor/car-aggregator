'use strict'
// scripts/normalize.js — Layer 2 of the pipeline.
//
// Two responsibilities (run sequentially):
//
//   1. INGEST: read rows from raw_listings whose (source, source_id) is not
//      yet in the canonical listings table, normalize them (slugs, fuel,
//      transmission, mileage shorthand, red flags, source tier), and upsert
//      into listings.
//
//   2. BACKFILL: for every existing row in listings, recompute red_flags[]
//      from description_ar + title + mileage_km. This is the critical bug
//      fix for the v2 refactor — listings previously scored via DB median
//      never had red-flag detection applied, so wrecked cars could score
//      10.0 on price alone.
//
// Idempotent: safe to re-run. Red-flag rewrites overwrite the array in place.
//
// Usage:  node scripts/normalize.js                 # both passes
//         node scripts/normalize.js --ingest-only
//         node scripts/normalize.js --backfill-only

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
const redflags = require('../lib/scoring/redflags')
const norm     = require('../lib/scoring/normalize')
const tiers    = require('../lib/scoring/tiers')

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1)
}
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const FLAGS = {
  ingestOnly:    process.argv.includes('--ingest-only'),
  backfillOnly:  process.argv.includes('--backfill-only'),
}

const PAGE = 1000
const UPDATE_CONCURRENCY = 20

// ── Pass 1: INGEST raw_listings → listings ─────────────────────────────────

function rawToListingRow (raw) {
  const sd = raw.structured_data ?? {}
  const tier = tiers.sourceToTier(raw.source)

  // structured_data is expected to follow the schema scrapers write — fields
  // are nullable. We do not invent data; missing fields stay null.
  const row = {
    source:                raw.source,
    source_url:            raw.source_url ?? sd.source_url ?? null,
    source_id:             raw.source_id  ?? sd.source_id  ?? null,
    make_slug:             norm.toSlug(sd.make_en ?? sd.make_ar) ?? null,
    make_en:               sd.make_en  ?? null,
    make_ar:               sd.make_ar  ?? null,
    model_slug:            norm.toSlug(sd.model_en ?? sd.model_ar) ?? null,
    model_en:              sd.model_en ?? null,
    model_ar:              sd.model_ar ?? null,
    year:                  sd.year     ?? null,
    price_sar:             sd.price_sar ?? null,
    mileage_km:            sd.mileage_km ?? null,
    city_slug:             norm.toSlug(sd.city_en ?? sd.city_ar) ?? null,
    city_en:               sd.city_en  ?? null,
    city_ar:               sd.city_ar  ?? null,
    color_slug:            norm.toSlug(sd.color_en ?? sd.color_ar) ?? null,
    color_en:              sd.color_en ?? null,
    color_ar:              sd.color_ar ?? null,
    fuel_type_slug:        norm.fuelSlug(sd.fuel_type) ?? null,
    transmission_slug:     norm.transSlug(sd.transmission) ?? null,
    body_type_slug:        norm.toSlug(sd.body_type) ?? null,
    condition:             sd.condition ?? 'used',
    trim:                  sd.trim ?? null,
    seller_type:           sd.seller_type ?? 'private',
    title:                 sd.title ?? null,
    description_ar:        sd.description_ar ?? sd.description ?? null,
    photo_urls:            Array.isArray(sd.photos) && sd.photos.length ? sd.photos : null,
    scraped_at:            raw.scraped_at ?? sd.scraped_at ?? null,
    is_active:             sd.is_active ?? true,
    contact_for_price:     sd.price_sar == null,
    low_price_warning:     false,
    source_quality_tier:   tier,
    external_price_label:  raw.external_price_label ?? null,
    platform_metadata:     raw.platform_metadata ?? null,
  }

  // Saudi shorthand fix — applies to mileage_km and price_sar.
  const shorthand = norm.heuristicShorthandFix(row)
  if (shorthand.mileage_km != null) row.mileage_km = shorthand.mileage_km
  if (shorthand.price_sar  != null) row.price_sar  = shorthand.price_sar

  // Red flags computed from description + title + mileage.
  row.red_flags = redflags.detect(row)

  return row
}

async function ingestRawListings () {
  // Page through raw_listings, batch-check which (source, source_id) keys are
  // missing from listings, normalize those, upsert.
  let offset = 0
  let totalRead = 0, totalInserted = 0, totalSkipped = 0
  const errors = []

  for (;;) {
    const { data: page, error } = await sb
      .from('raw_listings')
      .select('id, source, source_url, source_id, structured_data, external_price_label, platform_metadata, scraped_at')
      .order('scraped_at', { ascending: false })
      .range(offset, offset + PAGE - 1)
    if (error) throw new Error(`read raw_listings: ${error.message}`)
    if (!page || page.length === 0) break

    totalRead += page.length

    // Bulk-check existing (source, source_id) in listings.
    const keys = page
      .filter(r => r.source_id)
      .map(r => `(${JSON.stringify(r.source)},${JSON.stringify(r.source_id)})`)
    if (keys.length > 0) {
      // Supabase doesn't support tuple IN — fall back to per-source filter.
      const bySource = {}
      for (const r of page) if (r.source_id) (bySource[r.source] ??= []).push(r.source_id)
      const existing = new Set()
      for (const [src, ids] of Object.entries(bySource)) {
        // Chunk to avoid huge IN clauses
        for (let i = 0; i < ids.length; i += 500) {
          const slice = ids.slice(i, i + 500)
          const { data: ex, error: exErr } = await sb
            .from('listings')
            .select('source_id')
            .eq('source', src)
            .in('source_id', slice)
          if (exErr) throw new Error(`lookup listings: ${exErr.message}`)
          for (const e of ex ?? []) existing.add(`${src}|${e.source_id}`)
        }
      }

      const toInsert = []
      for (const raw of page) {
        if (!raw.source_id) { totalSkipped++; continue }
        if (existing.has(`${raw.source}|${raw.source_id}`)) { totalSkipped++; continue }
        toInsert.push(rawToListingRow(raw))
      }

      if (toInsert.length > 0) {
        // Plain insert (no unique constraint on listings.(source, source_id));
        // we already pre-checked against existing keys above.
        for (let i = 0; i < toInsert.length; i += 100) {
          const batch = toInsert.slice(i, i + 100)
          const { error: insErr } = await sb.from('listings').insert(batch)
          if (insErr) {
            errors.push(`insert at ${i}: ${insErr.message}`)
          } else {
            totalInserted += batch.length
          }
        }
        process.stdout.write(`  ingest: read ${totalRead} | inserted ${totalInserted} | skipped ${totalSkipped}\r`)
      }
    }

    if (page.length < PAGE) break
    offset += page.length
  }
  process.stdout.write('\n')

  return { totalRead, totalInserted, totalSkipped, errors }
}

// ── Pass 2: BACKFILL red_flags on existing listings ─────────────────────────

async function backfillRedFlags () {
  // Page through all listings, recompute red_flags from description_ar + title
  // + mileage_km, and update rows whose flag set has changed.

  let offset = 0
  let totalScanned = 0, totalUpdated = 0, totalUnchanged = 0, totalWithFlags = 0
  const flagFreq = {}
  const errors = []

  for (;;) {
    const { data: page, error } = await sb
      .from('listings')
      .select('id, description_ar, title, mileage_km, red_flags, price_sar, year')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw new Error(`read listings: ${error.message}`)
    if (!page || page.length === 0) break

    totalScanned += page.length

    const updates = []
    for (const r of page) {
      const newFlags = redflags.detect(r)
      const oldFlags = r.red_flags ?? []
      const changed = !arraysEqual(oldFlags.sort(), newFlags.slice().sort())

      // Also defensively apply the shorthand fix in case some legacy loader missed it.
      const shorthand = norm.heuristicShorthandFix(r)
      const patch = {}
      if (changed) {
        patch.red_flags = newFlags
      }
      if (shorthand.mileage_km != null && shorthand.mileage_km !== r.mileage_km) {
        patch.mileage_km = shorthand.mileage_km
      }
      if (shorthand.price_sar != null && shorthand.price_sar !== r.price_sar) {
        patch.price_sar = shorthand.price_sar
      }

      if (Object.keys(patch).length > 0) {
        updates.push({ id: r.id, patch })
      } else {
        totalUnchanged++
      }

      if (newFlags.length > 0) {
        totalWithFlags++
        for (const f of newFlags) flagFreq[f] = (flagFreq[f] ?? 0) + 1
      }
    }

    // Apply updates with limited concurrency.
    for (let i = 0; i < updates.length; i += UPDATE_CONCURRENCY) {
      const batch = updates.slice(i, i + UPDATE_CONCURRENCY)
      await Promise.all(batch.map(async ({ id, patch }) => {
        const { error: upErr } = await sb.from('listings').update(patch).eq('id', id)
        if (upErr) errors.push(`update ${id}: ${upErr.message}`)
        else totalUpdated++
      }))
    }

    process.stdout.write(`  backfill: scanned ${totalScanned} | updated ${totalUpdated} | flagged ${totalWithFlags}\r`)

    if (page.length < PAGE) break
    offset += page.length
  }
  process.stdout.write('\n')

  return { totalScanned, totalUpdated, totalUnchanged, totalWithFlags, flagFreq, errors }
}

function arraysEqual (a, b) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

// ── Main ────────────────────────────────────────────────────────────────────
;(async () => {
  console.log('Layer 2: normalize\n')
  const t0 = Date.now()

  if (!FLAGS.backfillOnly) {
    console.log('--- Pass 1: INGEST raw_listings → listings ---')
    const r = await ingestRawListings()
    console.log(`  read: ${r.totalRead} | inserted: ${r.totalInserted} | skipped: ${r.totalSkipped}`)
    if (r.errors.length > 0) {
      console.log(`  errors: ${r.errors.length}`)
      for (const e of r.errors.slice(0, 10)) console.log(`    ${e}`)
    }
    console.log()
  }

  if (!FLAGS.ingestOnly) {
    console.log('--- Pass 2: BACKFILL red_flags on existing listings ---')
    const r = await backfillRedFlags()
    console.log(`  scanned: ${r.totalScanned} | updated: ${r.totalUpdated} | unchanged: ${r.totalUnchanged} | with flags: ${r.totalWithFlags}`)
    console.log('  flag frequency:')
    const entries = Object.entries(r.flagFreq).sort((a, b) => b[1] - a[1])
    for (const [flag, count] of entries) console.log(`    ${flag.padEnd(28)} ${count}`)
    if (r.errors.length > 0) {
      console.log(`  errors: ${r.errors.length}`)
      for (const e of r.errors.slice(0, 10)) console.log(`    ${e}`)
    }
  }

  const dt = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`\nDone in ${dt}s`)
})().catch(e => { console.error(e); process.exit(1) })
