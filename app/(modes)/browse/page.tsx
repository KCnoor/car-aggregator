import { supabase, type Listing } from '@/lib/supabase'
import ListingsClient from '@/app/components/ListingsClient'

// Browse pulls live listings + new-deals count on every request. Without
// this the App Router prerenders it at build time and the count + cards
// never refresh until a redeploy.
export const dynamic = 'force-dynamic'

// Sources known to the ribbon. New sources added to the catalogue need a
// matching entry here so the per-source count query covers them.
const KNOWN_SOURCES = [
  'syarah','soum','carswitch','digitalcar','motory','yallamotor',
  'gogomotor','saudisale','dubizzle','haraj','carly',
]

export default async function Home() {
  // 24h cutoff for the "new deals today" metric, computed server-side.
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

  // PostgREST caps at 1000 rows per request — fetch in 3 parallel batches.
  // b0 doubles as the source of `totalCount` via the count: 'exact' hint.
  // newDealsCount comes from a separate head-only count query.
  const [b0, b1, b2, newCountRes] = await Promise.all([
    supabase.from('listings').select('*', { count: 'exact' })
      .eq('is_active', true)
      .neq('freshness_state', 'dead')
      .order('deal_score', { ascending: false, nullsFirst: false })
      .range(0, 999),
    supabase.from('listings').select('*')
      .eq('is_active', true)
      .neq('freshness_state', 'dead')
      .order('deal_score', { ascending: false, nullsFirst: false })
      .range(1000, 1999),
    supabase.from('listings').select('*')
      .eq('is_active', true)
      .neq('freshness_state', 'dead')
      .order('deal_score', { ascending: false, nullsFirst: false })
      .range(2000, 2999),
    supabase.from('listings').select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .neq('freshness_state', 'dead')
      .gte('first_seen_at', since24h),
  ])

  if (b0.error) console.error('Failed to fetch listings:', b0.error.message)

  const listings = [
    ...((b0.data ?? []) as Listing[]),
    ...((b1.data ?? []) as Listing[]),
    ...((b2.data ?? []) as Listing[]),
  ]

  // Per-source active counts — drives the 5-listing ribbon threshold so a
  // source under-represented in the corpus doesn't surface in the UI looking
  // broken. 11 parallel head-count queries — adds ~100ms to page render.
  const sourceCountRes = await Promise.all(
    KNOWN_SOURCES.map(src =>
      supabase.from('listings').select('*', { count: 'exact', head: true })
        .eq('source', src).eq('is_active', true).neq('freshness_state', 'dead')
    )
  )
  const sourceCounts: Record<string, number> = {}
  KNOWN_SOURCES.forEach((src, i) => { sourceCounts[src] = sourceCountRes[i].count ?? 0 })

  // Canonical make/model catalogue — powers the filter dropdowns so they
  // show one row per canonical make (no 'Mercedes' / 'Mercedes Benz' /
  // 'Mercedes-Benz' triplicates) and clean per-make model lists.
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

  return (
    <ListingsClient
      listings={listings}
      totalCount={b0.count ?? listings.length}
      newDealsCount={newCountRes.count ?? 0}
      newDealsSinceIso={since24h}
      sourceCounts={sourceCounts}
      canonicalMakes={canonicalMakes}
      canonicalModels={canonicalModels}
    />
  )
}
