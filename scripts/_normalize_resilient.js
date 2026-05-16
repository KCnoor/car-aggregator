'use strict'
// One-shot resilient normalize ingest. Avoids the chunked IN queries that
// keep hitting transient fetch failures by pre-loading the existing
// (source, source_id) keyset once and doing dedup client-side.

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
const redflags = require('../lib/scoring/redflags')
const norm     = require('../lib/scoring/normalize')
const tiers    = require('../lib/scoring/tiers')

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const PAGE = 1000

async function withRetry (fn, label, retries = 5) {
  let lastErr
  for (let i = 0; i < retries; i++) {
    try { return await fn() } catch (e) {
      lastErr = e
      const sleepMs = 1500 * Math.pow(2, i) + Math.random() * 500
      process.stderr.write(`[retry] ${label} attempt ${i + 1}/${retries} failed: ${e.message?.slice(0, 80)}; sleeping ${sleepMs.toFixed(0)}ms\n`)
      await new Promise(r => setTimeout(r, sleepMs))
    }
  }
  throw lastErr
}

function rawToListingRow (raw) {
  const sd = raw.structured_data ?? {}
  const tier = tiers.sourceToTier(raw.source)

  const resolveCategory = (category, en, ar) => {
    if (en) {
      const hit = norm.translate(category, en)
      if (hit) return { slug: hit.slug, en: hit.en, ar: hit.ar ?? ar ?? null }
      return { slug: norm.toSlug(en), en, ar: ar ?? null }
    }
    if (ar) {
      const hit = norm.translate(category, ar)
      if (hit) return { slug: hit.slug, en: hit.en, ar }
      return { slug: null, en: null, ar }
    }
    return { slug: null, en: null, ar: null }
  }
  const makeR  = resolveCategory('makes',  sd.make_en,  sd.make_ar)
  const modelR = resolveCategory('models', sd.model_en, sd.model_ar)
  const cityR  = resolveCategory('cities', sd.city_en,  sd.city_ar)
  const colorR = resolveCategory('colors', sd.color_en, sd.color_ar)

  const row = {
    source:                raw.source,
    source_url:            raw.source_url ?? sd.source_url ?? null,
    source_id:             raw.source_id  ?? sd.source_id  ?? null,
    make_slug:             makeR.slug,
    make_en:               makeR.en,
    make_ar:               makeR.ar,
    model_slug:            modelR.slug,
    model_en:              modelR.en,
    model_ar:              modelR.ar,
    year:                  sd.year     ?? null,
    price_sar:             sd.price_sar ?? null,
    mileage_km:            sd.mileage_km ?? null,
    city_slug:             cityR.slug,
    city_en:               cityR.en,
    city_ar:               cityR.ar,
    color_slug:            colorR.slug,
    color_en:              colorR.en,
    color_ar:              colorR.ar,
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

  const shorthand = norm.heuristicShorthandFix(row)
  if (shorthand.mileage_km != null) row.mileage_km = shorthand.mileage_km
  if (shorthand.price_sar  != null) row.price_sar  = shorthand.price_sar

  row.red_flags = redflags.detect(row)
  return row
}

;(async () => {
  const t0 = Date.now()
  console.log('Loading existing listings keyset…')
  const existing = new Set()
  let offset = 0
  for (;;) {
    const { data, error } = await withRetry(() =>
      sb.from('listings').select('source, source_id').not('source_id', 'is', null)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1)
        .then(r => { if (r.error) throw r.error; return r })
    , `listings page offset=${offset}`)
    if (!data || data.length === 0) break
    for (const r of data) existing.add(`${r.source}|${r.source_id}`)
    if (data.length < PAGE) break
    offset += data.length
  }
  console.log(`  ${existing.size} existing (source, source_id) pairs loaded`)

  console.log('\nIngesting raw_listings → listings…')
  const perSource = {}
  let totalRead = 0, totalInserted = 0, totalSkipped = 0
  const errors = []
  offset = 0
  for (;;) {
    const { data: page, error } = await withRetry(() =>
      sb.from('raw_listings')
        .select('id, source, source_url, source_id, structured_data, external_price_label, platform_metadata, scraped_at')
        .order('scraped_at', { ascending: false })
        .range(offset, offset + PAGE - 1)
        .then(r => { if (r.error) throw r.error; return r })
    , `raw_listings page offset=${offset}`)
    if (!page || page.length === 0) break
    totalRead += page.length

    const toInsert = []
    for (const raw of page) {
      if (!raw.source_id) { totalSkipped++; continue }
      const key = `${raw.source}|${raw.source_id}`
      if (existing.has(key)) { totalSkipped++; continue }
      existing.add(key)   // dedupe inside this run too
      const row = rawToListingRow(raw)
      toInsert.push(row)
    }

    if (toInsert.length > 0) {
      for (let i = 0; i < toInsert.length; i += 50) {
        const batch = toInsert.slice(i, i + 50)
        try {
          await withRetry(() =>
            sb.from('listings').insert(batch).then(r => { if (r.error) throw r.error; return r })
          , `insert batch ${i}`)
          totalInserted += batch.length
          for (const row of batch) perSource[row.source] = (perSource[row.source] ?? 0) + 1
        } catch (e) {
          errors.push(`insert at ${i}: ${e.message?.slice(0, 120)}`)
        }
      }
    }

    if (page.length < PAGE) break
    offset += page.length
    process.stdout.write(`  read ${totalRead} | inserted ${totalInserted} | skipped ${totalSkipped}\r`)
  }
  process.stdout.write('\n')

  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  console.log(`  read: ${totalRead}`)
  console.log(`  inserted: ${totalInserted}`)
  console.log(`  skipped: ${totalSkipped}`)
  console.log(`  errors: ${errors.length}`)
  if (errors.length > 0) for (const e of errors.slice(0, 5)) console.log(`    ${e}`)
  console.log('\nInserted by source:')
  for (const [src, n] of Object.entries(perSource)) console.log(`  ${src.padEnd(12)} +${n}`)
})().catch(e => { console.error(e); process.exit(1) })
