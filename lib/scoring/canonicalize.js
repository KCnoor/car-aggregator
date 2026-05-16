'use strict'
// Make/model canonicalization against canonical_makes / canonical_models.
//
//   const canon = await loadCanonical(sb)
//   const { makeSlug, modelSlug, needsReview } =
//     canon.resolve({ make_slug, make_en, make_ar, model_slug, model_en, model_ar })
//
// Match priority for a make:
//   1. Direct slug match against canonical_make_slug
//   2. Slug in alternate_names_en
//   3. make_en (lowercased) in alternate_names_en
//   4. make_ar (trimmed) in alternate_names_ar
// First hit wins. If no hit → needsReview = true and the original slugs are
// returned unchanged.
//
// Model lookup is scoped to whichever make canonicalized.

const { createClient } = require('@supabase/supabase-js')

async function loadCanonical (sb) {
  if (!sb) {
    sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  }

  const { data: makes, error: e1 } = await sb.from('canonical_makes').select('*')
  if (e1) throw e1
  const { data: models, error: e2 } = await sb.from('canonical_models').select('*')
  if (e2) throw e2

  // Build flat lookup maps.
  // makeAltEn:   en-alt   → canonical_make_slug
  // makeAltAr:   ar-alt   → canonical_make_slug
  // makeBySlug:  canonical_make_slug → { en, ar }   (for label lookup)
  // modelAltEn:  `${make_slug}|${en-alt}` → canonical_model_slug
  // modelBySlug: `${make_slug}|${model_slug}` → { en, ar }
  const makeAltEn = new Map()
  const makeAltAr = new Map()
  const makeBySlug = new Map()
  for (const m of makes) {
    makeBySlug.set(m.canonical_make_slug, { en: m.canonical_name_en, ar: m.canonical_name_ar })
    for (const alt of m.alternate_names_en ?? []) {
      makeAltEn.set(alt.toLowerCase(), m.canonical_make_slug)
    }
    for (const alt of m.alternate_names_ar ?? []) {
      makeAltAr.set(alt.trim(), m.canonical_make_slug)
    }
  }
  const modelAltEn = new Map()
  const modelAltAr = new Map()
  const modelBySlug = new Map()
  for (const m of models) {
    modelBySlug.set(`${m.canonical_make_slug}|${m.canonical_model_slug}`, {
      en: m.canonical_name_en, ar: m.canonical_name_ar,
    })
    for (const alt of m.alternate_names_en ?? []) {
      modelAltEn.set(`${m.canonical_make_slug}|${alt.toLowerCase()}`, m.canonical_model_slug)
    }
    for (const alt of m.alternate_names_ar ?? []) {
      modelAltAr.set(`${m.canonical_make_slug}|${alt.trim()}`, m.canonical_model_slug)
    }
  }

  function resolveMake (row) {
    if (row.make_slug) {
      const hit = makeAltEn.get(row.make_slug.toLowerCase())
      if (hit) return hit
    }
    if (row.make_en) {
      const hit = makeAltEn.get(row.make_en.toLowerCase())
      if (hit) return hit
    }
    if (row.make_ar) {
      const hit = makeAltAr.get(row.make_ar.trim())
      if (hit) return hit
    }
    return null
  }

  function resolveModel (makeSlug, row) {
    if (!makeSlug) return null
    if (row.model_slug) {
      const hit = modelAltEn.get(`${makeSlug}|${row.model_slug.toLowerCase()}`)
      if (hit) return hit
    }
    if (row.model_en) {
      const hit = modelAltEn.get(`${makeSlug}|${row.model_en.toLowerCase()}`)
      if (hit) return hit
    }
    if (row.model_ar) {
      const hit = modelAltAr.get(`${makeSlug}|${row.model_ar.trim()}`)
      if (hit) return hit
    }
    return null
  }

  return {
    stats: { makes: makes.length, models: models.length },

    resolve (row) {
      const canonicalMake  = resolveMake(row)
      const canonicalModel = canonicalMake ? resolveModel(canonicalMake, row) : null
      const needsReview = !canonicalMake || !canonicalModel
      const makeNames  = canonicalMake  ? makeBySlug.get(canonicalMake)  : null
      const modelNames = canonicalModel ? modelBySlug.get(`${canonicalMake}|${canonicalModel}`) : null
      return {
        makeSlug:  canonicalMake ?? row.make_slug ?? null,
        modelSlug: canonicalModel ?? row.model_slug ?? null,
        // Canonical display names if we mapped; null otherwise (caller keeps
        // the original make_en/make_ar in that case).
        makeNameEn:  makeNames?.en  ?? null,
        makeNameAr:  makeNames?.ar  ?? null,
        modelNameEn: modelNames?.en ?? null,
        modelNameAr: modelNames?.ar ?? null,
        // Surfaces *which* part failed so callers can render a hint if they want.
        unmappedMake:  !canonicalMake,
        unmappedModel: !canonicalModel && !!canonicalMake,
        needsReview,
      }
    },
  }
}

module.exports = { loadCanonical }
