import { supabase, type Listing } from '@/lib/supabase'
import ListingsClient from './components/ListingsClient'

export default async function Home() {
  const { data, error, count } = await supabase
    .from('listings')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .order('deal_score', { ascending: false, nullsFirst: false })
    .range(0, 4999)

  if (error) console.error('Failed to fetch listings:', error.message)

  return (
    <ListingsClient
      listings={(data as Listing[]) ?? []}
      totalCount={count ?? 0}
    />
  )
}
