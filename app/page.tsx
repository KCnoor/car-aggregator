import { supabase, type Listing } from '@/lib/supabase'
import ListingsClient from './components/ListingsClient'

export default async function Home() {
  // PostgREST caps at 1000 rows per request — fetch in 3 parallel batches
  const [b0, b1, b2] = await Promise.all([
    supabase.from('listings').select('*', { count: 'exact' })
      .eq('is_active', true)
      .order('deal_score', { ascending: false, nullsFirst: false })
      .range(0, 999),
    supabase.from('listings').select('*')
      .eq('is_active', true)
      .order('deal_score', { ascending: false, nullsFirst: false })
      .range(1000, 1999),
    supabase.from('listings').select('*')
      .eq('is_active', true)
      .order('deal_score', { ascending: false, nullsFirst: false })
      .range(2000, 2999),
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
    />
  )
}
