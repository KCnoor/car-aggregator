'use strict'
// Load scripts/canonical_seed.js into the canonical_makes / canonical_models
// tables. Upsert by canonical_make_slug (and composite key for models), so
// re-running picks up edits without duplicating rows.
//
// Usage: node scripts/seed_canonical.js

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
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const { MAKES, MODELS } = require('./canonical_seed.js')

// Normalize alternates: lowercase, dedupe, ensure the slug + canonical name
// are themselves in the alternates so direct matches work without extra rules.
function normAltEn (slug, name, alts) {
  const set = new Set(alts.map(s => s.toLowerCase()))
  set.add(slug.toLowerCase())
  set.add(name.toLowerCase())
  return [...set]
}
function normAltAr (name, alts) {
  const set = new Set((alts ?? []).map(s => s.trim()))
  if (name) set.add(name.trim())
  return [...set]
}

;(async () => {
  console.log(`Seeding ${MAKES.length} makes…`)
  const makeRows = MAKES.map(m => ({
    canonical_make_slug: m.slug,
    canonical_name_en: m.en,
    canonical_name_ar: m.ar,
    alternate_names_en: normAltEn(m.slug, m.en, m.altEn ?? []),
    alternate_names_ar: normAltAr(m.ar, m.altAr ?? []),
    updated_at: new Date().toISOString(),
  }))
  const { error: e1 } = await sb.from('canonical_makes').upsert(makeRows, { onConflict: 'canonical_make_slug' })
  if (e1) throw e1

  console.log(`Seeding ${MODELS.length} models…`)
  // Validate every model's make_slug exists in MAKES (catches typos before
  // FK error surfaces).
  const makeSet = new Set(MAKES.map(m => m.slug))
  for (const m of MODELS) {
    if (!makeSet.has(m.make_slug)) {
      throw new Error(`MODELS entry has unknown make_slug=${m.make_slug} (model=${m.slug})`)
    }
  }
  const modelRows = MODELS.map(m => ({
    canonical_make_slug: m.make_slug,
    canonical_model_slug: m.slug,
    canonical_name_en: m.en,
    canonical_name_ar: m.ar,
    alternate_names_en: normAltEn(m.slug, m.en, m.altEn ?? []),
    alternate_names_ar: normAltAr(m.ar, m.altAr ?? []),
    updated_at: new Date().toISOString(),
  }))
  // Upsert in chunks to stay under PostgREST's default 16k payload.
  for (let i = 0; i < modelRows.length; i += 200) {
    const chunk = modelRows.slice(i, i + 200)
    const { error: e2 } = await sb.from('canonical_models').upsert(chunk, {
      onConflict: 'canonical_make_slug,canonical_model_slug',
    })
    if (e2) throw e2
  }
  console.log('Done.')
})().catch(e => { console.error(e); process.exit(1) })
