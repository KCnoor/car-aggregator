import { supabase, type Listing } from '@/lib/supabase'
import HuntClient from './HuntClient'
import { BUNDLES, type Bundle } from './bundles'

// الصياد — the hunter mode at /hunt. Server component fetches all
// candidate listings for the currently-selected models + year window.
//
// URL params (for cross-mode hand-off):
//   ?models=toyota-camry,honda-accord    — pairs of "{make_slug}-{model_slug}"
//   ?years=2020-2024                     — inclusive range
//   ?bundle=<bundle-id>                  — load a named preset
//
// When nothing is specified the default bundle (Mid Japanese Sedan) loads
// so the user sees a working chart on first visit.

export const dynamic = 'force-dynamic'

const DEFAULT_BUNDLE_ID = 'mid-japanese-sedan'
const DEFAULT_YEAR_MIN  = 2020
const DEFAULT_YEAR_MAX  = 2024

type ModelKey = { make: string; model: string }

// Parse `make_slug-model_slug` from the URL. Model slugs can themselves
// contain hyphens (e.g. land-cruiser), so we treat the FIRST hyphen as the
// make/model separator and the remainder as the model slug.
function parseModelToken (token: string): ModelKey | null {
  const dash = token.indexOf('-')
  if (dash <= 0) return null
  return { make: token.slice(0, dash), model: token.slice(dash + 1) }
}

function resolveSelection (params: { models?: string; years?: string; bundle?: string }): {
  models: ModelKey[]
  yearMin: number
  yearMax: number
  activeBundleId: string | null
} {
  // Models from URL win over the bundle preset.
  const rawModels = (params.models ?? '').trim()
  if (rawModels) {
    const tokens = rawModels.split(',').map(t => parseModelToken(t.trim())).filter(Boolean) as ModelKey[]
    const yr = parseYearRange(params.years)
    return { models: tokens.slice(0, 5), yearMin: yr[0], yearMax: yr[1], activeBundleId: null }
  }
  const bundleId = (params.bundle ?? '').trim() || DEFAULT_BUNDLE_ID
  const bundle: Bundle | undefined = BUNDLES.find(b => b.id === bundleId)
  if (!bundle) {
    return {
      models: BUNDLES[0].models,
      yearMin: DEFAULT_YEAR_MIN, yearMax: DEFAULT_YEAR_MAX,
      activeBundleId: BUNDLES[0].id,
    }
  }
  const yr = parseYearRange(params.years)
  return { models: bundle.models, yearMin: yr[0], yearMax: yr[1], activeBundleId: bundle.id }
}

function parseYearRange (raw?: string): [number, number] {
  if (!raw) return [DEFAULT_YEAR_MIN, DEFAULT_YEAR_MAX]
  const m = raw.match(/^(\d{4})-(\d{4})$/)
  if (!m) return [DEFAULT_YEAR_MIN, DEFAULT_YEAR_MAX]
  const lo = Math.min(parseInt(m[1]), parseInt(m[2]))
  const hi = Math.max(parseInt(m[1]), parseInt(m[2]))
  return [lo, hi]
}

async function loadListings (selection: ModelKey[], yearMin: number, yearMax: number): Promise<Listing[]> {
  if (selection.length === 0) return []
  // Pull anything matching (make_slug, model_slug) and the year range, then
  // post-filter to the exact (make, model) pairs client-side — Supabase has
  // no native tuple-IN operator. We cap server-side at 800 (200 per model
  // × 5 models max), then trim further on the client after percentile clip.
  const makes  = [...new Set(selection.map(s => s.make))]
  const models = [...new Set(selection.map(s => s.model))]
  const { data, error } = await supabase.from('listings')
    .select('*')
    .eq('is_active', true)
    .neq('freshness_state', 'dead')
    .in('make_slug', makes)
    .in('model_slug', models)
    .gte('year', yearMin).lte('year', yearMax)
    .gt('price_sar', 1000)
    .not('mileage_km', 'is', null)
    .order('deal_score', { ascending: false, nullsFirst: false })
    .limit(800)
  if (error) {
    console.error('hunt: listings load failed:', error.message)
    return []
  }
  const pairSet = new Set(selection.map(s => `${s.make}|${s.model}`))
  return (data ?? []).filter((l: Listing) =>
    pairSet.has(`${l.make_slug ?? ''}|${l.model_slug ?? ''}`)
  ) as Listing[]
}

export default async function HuntPage ({
  searchParams,
}: {
  searchParams: Promise<{ models?: string; years?: string; bundle?: string }>
}) {
  const params = await searchParams
  const { models, yearMin, yearMax, activeBundleId } = resolveSelection(params)
  const listings = await loadListings(models, yearMin, yearMax)

  return (
    <HuntClient
      initialModels={models}
      initialYearMin={yearMin}
      initialYearMax={yearMax}
      initialBundleId={activeBundleId}
      initialListings={listings}
      bundles={BUNDLES}
    />
  )
}
