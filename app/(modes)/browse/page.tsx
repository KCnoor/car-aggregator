import { supabase, type Listing } from '@/lib/supabase'
import ListingsClient from '@/app/components/ListingsClient'

// Browse — server-side paginated. 50 listings per page, page index from
// the ?page query param. Total count comes back via Supabase's
// count:'exact' on the same query.
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

const KNOWN_SOURCES = [
  'syarah','soum','carswitch','digitalcar','motory','yallamotor',
  'gogomotor','saudisale','dubizzle','haraj','carly',
]

export default async function Home ({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const params = await searchParams
  const requestedPage = Math.max(1, parseInt(params.page ?? '1', 10) || 1)

  // 24h cutoff for the "new deals today" metric.
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

  const offset = (requestedPage - 1) * PAGE_SIZE
  const pageEnd = offset + PAGE_SIZE - 1

  const [pageRes, totalRes, newCountRes] = await Promise.all([
    supabase.from('listings').select('*')
      .eq('is_active', true)
      .neq('freshness_state', 'dead')
      .order('deal_score', { ascending: false, nullsFirst: false })
      .range(offset, pageEnd),
    supabase.from('listings').select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .neq('freshness_state', 'dead'),
    supabase.from('listings').select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .neq('freshness_state', 'dead')
      .gte('first_seen_at', since24h),
  ])

  if (pageRes.error) console.error('Failed to fetch listings:', pageRes.error.message)

  const listings = (pageRes.data ?? []) as Listing[]
  const totalCount = totalRes.count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  // Clamp current page in case the user navigated past the last page.
  const currentPage = Math.min(requestedPage, totalPages)

  const sourceCountRes = await Promise.all(
    KNOWN_SOURCES.map(src =>
      supabase.from('listings').select('*', { count: 'exact', head: true })
        .eq('source', src).eq('is_active', true).neq('freshness_state', 'dead')
    )
  )
  const sourceCounts: Record<string, number> = {}
  KNOWN_SOURCES.forEach((src, i) => { sourceCounts[src] = sourceCountRes[i].count ?? 0 })

  const [canonicalMakesRes, canonicalModelsRes] = await Promise.all([
    supabase.from('canonical_makes')
      .select('canonical_make_slug, canonical_name_en, canonical_name_ar')
      .order('canonical_name_en'),
    supabase.from('canonical_models')
      .select('canonical_make_slug, canonical_model_slug, canonical_name_en, canonical_name_ar')
      .order('canonical_name_en'),
  ])

  return (
    <ListingsClient
      listings={listings}
      totalCount={totalCount}
      currentPage={currentPage}
      totalPages={totalPages}
      pageSize={PAGE_SIZE}
      newDealsCount={newCountRes.count ?? 0}
      newDealsSinceIso={since24h}
      sourceCounts={sourceCounts}
      canonicalMakes={canonicalMakesRes.data ?? []}
      canonicalModels={canonicalModelsRes.data ?? []}
    />
  )
}
