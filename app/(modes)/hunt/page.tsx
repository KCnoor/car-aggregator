import { supabase, type Listing } from '@/lib/supabase'
import HuntClient, { type SlotSpec } from './HuntClient'

// الصياد — focused hunter mode at /hunt.
//
// URL format (each slot carries its own year window):
//   ?models=toyota-camry,honda-accord
//   ?years=2018-2022,2020-2024              ← parallel array, same index
//
// Either array may be missing or short; defaults to 2020-2024 per slot.
// Backward-compatible with the older single ?years=2020-2024 (used for
// every slot when only one range is provided).

export const dynamic = 'force-dynamic'

const DEFAULT_YEAR_MIN = 2020
const DEFAULT_YEAR_MAX = 2024
const PER_SLOT_LIMIT = 200

function parseModelToken (token: string): { make: string; model: string } | null {
  const dash = token.indexOf('-')
  if (dash <= 0) return null
  return { make: token.slice(0, dash), model: token.slice(dash + 1) }
}

function parseYearToken (raw: string | undefined, fallback: [number, number]): [number, number] {
  if (!raw) return fallback
  const m = raw.trim().match(/^(\d{4})-(\d{4})$/)
  if (!m) return fallback
  const lo = Math.min(parseInt(m[1]), parseInt(m[2]))
  const hi = Math.max(parseInt(m[1]), parseInt(m[2]))
  return [lo, hi]
}

function buildSpecs (modelsRaw?: string, yearsRaw?: string): SlotSpec[] {
  if (!modelsRaw) return []
  const tokens = modelsRaw.split(',').map(t => t.trim()).filter(Boolean)
  const yearTokens = (yearsRaw ?? '').split(',').map(t => t.trim())
  // If `yearsRaw` is one single range (no commas) treat it as the default for every slot.
  const singleRange = yearTokens.length === 1
    ? parseYearToken(yearTokens[0], [DEFAULT_YEAR_MIN, DEFAULT_YEAR_MAX])
    : null

  const out: SlotSpec[] = []
  tokens.slice(0, 5).forEach((tok, i) => {
    const mk = parseModelToken(tok)
    if (!mk) return
    const [lo, hi] = singleRange ?? parseYearToken(yearTokens[i], [DEFAULT_YEAR_MIN, DEFAULT_YEAR_MAX])
    out.push({ make: mk.make, model: mk.model, yearMin: lo, yearMax: hi })
  })
  return out
}

async function loadSlotListings (spec: SlotSpec): Promise<Listing[]> {
  const { data, error } = await supabase.from('listings')
    .select('*')
    .eq('is_active', true)
    .neq('freshness_state', 'dead')
    .eq('make_slug', spec.make)
    .eq('model_slug', spec.model)
    .gte('year', spec.yearMin).lte('year', spec.yearMax)
    .gt('price_sar', 1000)
    .not('mileage_km', 'is', null)
    .order('deal_score', { ascending: false, nullsFirst: false })
    .limit(PER_SLOT_LIMIT)
  if (error) {
    console.error(`hunt: slot load failed (${spec.make}/${spec.model}):`, error.message)
    return []
  }
  return (data ?? []) as Listing[]
}

export default async function HuntPage ({
  searchParams,
}: {
  searchParams: Promise<{ models?: string; years?: string }>
}) {
  const params = await searchParams
  const specs = buildSpecs(params.models, params.years)

  const [canonicalMakesRes, canonicalModelsRes] = await Promise.all([
    supabase.from('canonical_makes')
      .select('canonical_make_slug, canonical_name_en, canonical_name_ar')
      .order('canonical_name_en'),
    supabase.from('canonical_models')
      .select('canonical_make_slug, canonical_model_slug, canonical_name_en, canonical_name_ar')
      .order('canonical_name_en'),
  ])

  // Fire one query per filled slot in parallel. Each slot owns its own
  // year window so we can't fold them into a single IN-clause anymore.
  const perSlot = specs.length
    ? await Promise.all(specs.map(loadSlotListings))
    : []

  return (
    <HuntClient
      initialSpecs={specs}
      initialPerSlot={perSlot}
      canonicalMakes={canonicalMakesRes.data ?? []}
      canonicalModels={canonicalModelsRes.data ?? []}
    />
  )
}
