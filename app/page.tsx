import { supabase, type Listing } from '@/lib/supabase'
import ListingsClient from './components/ListingsClient'

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

  return (
    <ListingsClient
      listings={listings}
      totalCount={b0.count ?? listings.length}
      newDealsCount={newCountRes.count ?? 0}
      newDealsSinceIso={since24h}
    />
  )
}
