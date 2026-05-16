import { supabase, type Listing } from '@/lib/supabase'
import HuntClient from './HuntClient'

// الصياد — focused hunter mode at /hunt.
//
// URL params (shareable + cross-mode hand-off from الخطّابة later):
//   ?models=toyota-camry,honda-accord    — pairs of "{make_slug}-{model_slug}", max 5
//   ?years=2020-2024                     — inclusive range
//
// No bundles anymore (deliberately). Empty selection → empty state on
// the client; user fills slots manually using the make→model picker.

export const dynamic = 'force-dynamic'

const DEFAULT_YEAR_MIN = 2020
const DEFAULT_YEAR_MAX = 2024

type ModelKey = { make: string; model: string }

function parseModelToken (token: string): ModelKey | null {
  const dash = token.indexOf('-')
  if (dash <= 0) return null
  return { make: token.slice(0, dash), model: token.slice(dash + 1) }
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
  searchParams: Promise<{ models?: string; years?: string }>
}) {
  const params = await searchParams
  const models = (params.models ?? '')
    .split(',')
    .map(t => parseModelToken(t.trim()))
    .filter(Boolean)
    .slice(0, 5) as ModelKey[]
  const [yearMin, yearMax] = parseYearRange(params.years)

  // Canonical catalogue for the make→model picker. Restricted to entries
  // that have at least one active listing so the picker doesn't surface
  // makes the user can never get results for.
  const [canonicalMakesRes, canonicalModelsRes] = await Promise.all([
    supabase.from('canonical_makes')
      .select('canonical_make_slug, canonical_name_en, canonical_name_ar')
      .order('canonical_name_en'),
    supabase.from('canonical_models')
      .select('canonical_make_slug, canonical_model_slug, canonical_name_en, canonical_name_ar')
      .order('canonical_name_en'),
  ])
  const canonicalMakes  = canonicalMakesRes.data  ?? []
  const canonicalModels = canonicalModelsRes.data ?? []

  const listings = await loadListings(models, yearMin, yearMax)

  return (
    <HuntClient
      initialModels={models}
      initialYearMin={yearMin}
      initialYearMax={yearMax}
      initialListings={listings}
      canonicalMakes={canonicalMakes}
      canonicalModels={canonicalModels}
    />
  )
}
