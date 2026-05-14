import { supabase, type Listing } from '@/lib/supabase'
import ListingsClient from './components/ListingsClient'

export default async function Home() {
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('is_active', true)
    .order('deal_score', { ascending: false, nullsFirst: false })

  if (error) console.error('Failed to fetch listings:', error.message)

  return <ListingsClient listings={(data as Listing[]) ?? []} />
}
