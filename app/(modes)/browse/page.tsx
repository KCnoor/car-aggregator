import { supabase, type Listing } from '@/lib/supabase'
import ListingsClient from '@/app/components/ListingsClient'
import {
  parseFilters,
  applyListingFilters,
  applyListingSort,
  BROWSE_PAGE_SIZE,
  PRICE_FLOOR_SAR,
} from '@/lib/listing-filters'

// /browse — server-side paginated AND server-side filtered. The URL is
// the source of truth for every filter (city, make, model, year range,
// price, mileage, body, fuel, transmission, condition, source, sort) plus
// the existing q / new24h / page params. Both this server component and
// the ListingsClient that hydrates it read from the same parseFilters()
// helper, so the two can never disagree about what's filtered.
//
// The 15k SAR junk floor is applied unconditionally inside
// applyListingFilters() — see lib/listing-filters.ts.
export const dynamic = 'force-dynamic'

// Sources we want to count for the brand-logo ribbon row. The list is
// fixed so the ribbon order is stable regardless of which sources have
// listings on any given day.
const KNOWN_SOURCES = [
  'syarah', 'soum', 'carswitch', 'digitalcar', 'motory', 'yallamotor',
  'gogomotor', 'saudisale', 'dubizzle', 'haraj', 'carly',
]

// Field projection for the corpus-wide "what filter values actually exist?"
// query. We pull just the distinct dimensions, never the heavy listing
// columns (description / photos / etc).
const FILTER_FACET_COLUMNS = 'make_en, model_en, city_en, city_ar, body_type_slug, fuel_type_slug, transmission_slug, condition'

type FacetRow = {
  make_en: string | null
  model_en: string | null
  city_en: string | null
  city_ar: string | null
  body_type_slug: string | null
  fuel_type_slug: string | null
  transmission_slug: string | null
  condition: string | null
}

export default async function BrowsePage ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params  = await searchParams
  const filters = parseFilters(params)

  // 24h cutoff for the new-deals-today filter. Computed once per request
  // so every consumer of `filters.new24h` sees the same boundary.
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

  const offset  = (filters.page - 1) * BROWSE_PAGE_SIZE
  const pageEnd = offset + BROWSE_PAGE_SIZE - 1

  // Build the page query: select all columns, apply every URL filter
  // server-side, sort, then range. Total count is the same query MINUS
  // the order/range — Supabase needs `head: true` so it doesn't ship the
  // row payload, just the count.
  let pageQ  = applyListingFilters(supabase.from('listings').select('*'), filters, since24h)
  pageQ      = applyListingSort(pageQ, filters.sort).range(offset, pageEnd)

  const totalQ = applyListingFilters(
    supabase.from('listings').select('*', { count: 'exact', head: true }),
    filters,
    since24h,
  )

  // Source ribbon counts (15k floor applied; user-filters NOT applied
  // because the ribbon is "what's in the corpus", not "what matches your
  // current narrowing"). Same shape as before.
  const ribbonCountQs = KNOWN_SOURCES.map(src =>
    supabase.from('listings')
      .select('*', { count: 'exact', head: true })
      .eq('source', src)
      .eq('is_active', true)
      .neq('freshness_state', 'dead')
      .gte('price_sar', PRICE_FLOOR_SAR),
  )

  const [pageRes, totalRes, canonicalMakesRes, canonicalModelsRes, facetsRes, ...ribbonRes] = await Promise.all([
    pageQ,
    totalQ,
    supabase.from('canonical_makes')
      .select('canonical_make_slug, canonical_name_en, canonical_name_ar')
      .order('canonical_name_en'),
    supabase.from('canonical_models')
      .select('canonical_make_slug, canonical_model_slug, canonical_name_en, canonical_name_ar')
      .order('canonical_name_en'),
    // Corpus-wide facet query: every distinct filter dimension that has
    // any listing past the 15k floor. We pull up to 20k rows (current
    // corpus is ~17.3k after the floor) and dedupe in JS — Supabase
    // doesn't expose DISTINCT directly. This is one query, projecting
    // ~8 short columns, ~340 KB raw → comfortably small.
    supabase.from('listings')
      .select(FILTER_FACET_COLUMNS)
      .eq('is_active', true)
      .neq('freshness_state', 'dead')
      .gte('price_sar', PRICE_FLOOR_SAR)
      .limit(20000),
    ...ribbonCountQs,
  ])

  if (pageRes.error)  console.error('browse: page query failed:',  pageRes.error.message)
  if (totalRes.error) console.error('browse: total count failed:', totalRes.error.message)

  const listings   = (pageRes.data ?? []) as Listing[]
  const totalCount = totalRes.count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / BROWSE_PAGE_SIZE))
  // Clamp the page when the user navigates past the end (e.g. after a
  // filter narrows results so they no longer fill the requested page).
  const currentPage = Math.min(filters.page, totalPages)

  const sourceCounts: Record<string, number> = {}
  KNOWN_SOURCES.forEach((src, i) => {
    sourceCounts[src] = ribbonRes[i]?.count ?? 0
  })

  // Reduce the facet rows to one Set per dimension. The Set values are
  // the canonical English strings (case-preserved) that exist in the
  // corpus — the client uses them to filter the catalogue lookups down to
  // present-in-corpus entries.
  const facetRows = (facetsRes.data ?? []) as FacetRow[]
  const presentMakeEns        = new Set<string>()
  const presentModelEns       = new Set<string>()
  const presentCities         = new Map<string, { en: string; ar: string | null }>()
  const presentBodyTypes      = new Set<string>()
  const presentFuelTypes      = new Set<string>()
  const presentTransmissions  = new Set<string>()
  const presentConditions     = new Set<string>()
  for (const r of facetRows) {
    if (r.make_en)  presentMakeEns.add(r.make_en)
    if (r.model_en) presentModelEns.add(r.model_en)
    if (r.city_en && !presentCities.has(r.city_en)) presentCities.set(r.city_en, { en: r.city_en, ar: r.city_ar })
    if (r.body_type_slug)    presentBodyTypes.add(r.body_type_slug)
    if (r.fuel_type_slug)    presentFuelTypes.add(r.fuel_type_slug)
    if (r.transmission_slug) presentTransmissions.add(r.transmission_slug)
    if (r.condition)         presentConditions.add(r.condition)
  }

  return (
    <ListingsClient
      listings={listings}
      totalCount={totalCount}
      currentPage={currentPage}
      totalPages={totalPages}
      pageSize={BROWSE_PAGE_SIZE}
      sourceCounts={sourceCounts}
      canonicalMakes={canonicalMakesRes.data ?? []}
      canonicalModels={canonicalModelsRes.data ?? []}
      presentMakes={[...presentMakeEns]}
      presentModels={[...presentModelEns]}
      presentCities={[...presentCities.values()]}
      presentBodyTypes={[...presentBodyTypes]}
      presentFuelTypes={[...presentFuelTypes]}
      presentTransmissions={[...presentTransmissions]}
      presentConditions={[...presentConditions]}
    />
  )
}
