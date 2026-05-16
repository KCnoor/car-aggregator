'use strict'
// Backfill: walk every row in `listings` and apply make/model canonicalization
// via lib/scoring/canonicalize.js. Writes the updated slugs back to the DB
// and flags unmapped rows with needs_make_review = true.
//
// Idempotent. Re-running picks up new seed entries and re-flags accordingly.
//
// Usage: node scripts/canonicalize_listings.js
//        node scripts/canonicalize_listings.js --dry-run
//        node scripts/canonicalize_listings.js --active-only

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
} catch { /* not fatal */ }

const { createClient } = require('@supabase/supabase-js')
const { loadCanonical } = require('../lib/scoring/canonicalize.js')

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

function parseArgs () {
  const args = { dryRun: false, activeOnly: false }
  for (const a of process.argv.slice(2)) {
    if (a === '--dry-run') args.dryRun = true
    else if (a === '--active-only') args.activeOnly = true
  }
  return args
}

;(async () => {
  const args = parseArgs()
  const canon = await loadCanonical(sb)
  console.log(`Loaded canonical: ${canon.stats.makes} makes, ${canon.stats.models} models`)
  if (args.dryRun) console.log('(dry-run — no DB writes)')

  // Page through listings in 1k batches.
  const PAGE = 1000
  let from = 0
  let scanned = 0
  let makeChanged = 0
  let modelChanged = 0
  let needsReview = 0
  let writes = 0
  const unmappedMakes = new Map() // slug → count
  const unmappedModelsByMake = new Map()

  // Sample preview of the first 20 rows we change, for the report.
  const samples = []

  while (true) {
    let q = sb.from('listings')
      .select('id, make_slug, make_en, make_ar, model_slug, model_en, model_ar, is_active, needs_make_review')
      .range(from, from + PAGE - 1)
    if (args.activeOnly) q = q.eq('is_active', true)

    const { data, error } = await q
    if (error) throw error
    if (!data.length) break

    const updates = []
    for (const row of data) {
      scanned++
      const r = canon.resolve(row)

      const newMake  = r.makeSlug
      const newModel = r.modelSlug
      const newNeedsReview = r.needsReview

      // Detect any of: slug change, review-flag change, or label drift from
      // canonical (the row may already have the right slug but wrong en/ar
      // labels — e.g. 'Mercedes Benz' vs 'Mercedes-Benz').
      const labelDrift =
        (r.makeNameEn  && r.makeNameEn  !== row.make_en)  ||
        (r.makeNameAr  && r.makeNameAr  !== row.make_ar)  ||
        (r.modelNameEn && r.modelNameEn !== row.model_en) ||
        (r.modelNameAr && r.modelNameAr !== row.model_ar)
      const changed =
        newMake  !== row.make_slug ||
        newModel !== row.model_slug ||
        newNeedsReview !== !!row.needs_make_review ||
        labelDrift

      if (newMake !== row.make_slug)  makeChanged++
      if (newModel !== row.model_slug) modelChanged++
      if (newNeedsReview) needsReview++

      if (r.unmappedMake) {
        const k = row.make_slug ?? '(null)'
        unmappedMakes.set(k, (unmappedMakes.get(k) ?? 0) + 1)
      } else if (r.unmappedModel) {
        const k = `${newMake}|${row.model_slug ?? '(null)'}`
        unmappedModelsByMake.set(k, (unmappedModelsByMake.get(k) ?? 0) + 1)
      }

      if (changed) {
        if (samples.length < 20 && (newMake !== row.make_slug || newModel !== row.model_slug)) {
          samples.push({
            id: row.id,
            from: `${row.make_slug}/${row.model_slug}`,
            to:   `${newMake}/${newModel}`,
            needs_review: newNeedsReview,
          })
        }
        // Also overwrite the user-facing make_en/make_ar/model_en/model_ar
        // labels when we mapped — that's what powers the dropdown so we need
        // them consistent. Skip the rewrite for unmapped rows (keep scraper
        // labels intact, since those rows are flagged for review anyway).
        const u = {
          id: row.id,
          make_slug: newMake,
          model_slug: newModel,
          needs_make_review: newNeedsReview,
        }
        if (r.makeNameEn)  u.make_en  = r.makeNameEn
        if (r.makeNameAr)  u.make_ar  = r.makeNameAr
        if (r.modelNameEn) u.model_en = r.modelNameEn
        if (r.modelNameAr) u.model_ar = r.modelNameAr
        updates.push(u)
      }
    }

    if (!args.dryRun && updates.length) {
      // Supabase JS doesn't support bulk update-with-different-values via one
      // call; loop with concurrency.
      for (let i = 0; i < updates.length; i += 50) {
        const batch = updates.slice(i, i + 50)
        await Promise.all(batch.map(u => {
          const { id, ...rest } = u
          return sb.from('listings').update(rest).eq('id', id)
        }))
        writes += batch.length
      }
    }

    if (scanned % 2000 === 0 || data.length < PAGE) {
      console.log(`  scanned=${scanned} make_changed=${makeChanged} model_changed=${modelChanged} needs_review=${needsReview} writes=${writes}`)
    }

    if (data.length < PAGE) break
    from += PAGE
  }

  console.log('\n── Report ──')
  console.log(`scanned: ${scanned}`)
  console.log(`make canonicalized: ${makeChanged}`)
  console.log(`model canonicalized: ${modelChanged}`)
  console.log(`flagged needs_make_review: ${needsReview}`)
  console.log(`db writes: ${writes}`)

  if (unmappedMakes.size) {
    console.log('\nTop unmapped makes (add to canonical_seed.js MAKES if real):')
    const sorted = [...unmappedMakes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
    for (const [k, n] of sorted) console.log(`  ${String(n).padStart(4)}  ${k}`)
  }
  if (unmappedModelsByMake.size) {
    console.log('\nTop unmapped (make|model) pairs (add to MODELS if real):')
    const sorted = [...unmappedModelsByMake.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
    for (const [k, n] of sorted) console.log(`  ${String(n).padStart(4)}  ${k}`)
  }

  if (samples.length) {
    console.log('\nSample reassignments (first 20):')
    for (const s of samples) {
      console.log(`  ${s.id.slice(0, 8)}  ${s.from.padEnd(40)} → ${s.to.padEnd(40)}  ${s.needs_review ? '(needs_review)' : ''}`)
    }
  }
})().catch(e => { console.error(e); process.exit(1) })
