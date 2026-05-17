import { notFound } from 'next/navigation'
import { supabase, type Listing } from '@/lib/supabase'
import ListingDetailClient from './ListingDetailClient'

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) notFound()

  const listing = data as Listing

  // Dead listings stay in the DB for historical scoring/baselines but should
  // not be reachable from the user-facing detail page — the source URL no
  // longer resolves to a real ad.
  if (listing.freshness_state === 'dead' || listing.is_active === false) notFound()

  // Fetch similar listings (same make + model, different id)
  const { data: similar } = await supabase
    .from('listings')
    .select('*')
    .eq('make_slug',  listing.make_slug  ?? '')
    .eq('model_slug', listing.model_slug ?? '')
    .eq('is_active', true)
    .neq('freshness_state', 'dead')
    .neq('id', listing.id)
    .order('deal_score', { ascending: false, nullsFirst: false })
    .limit(6)

  return <ListingDetailClient listing={listing} similar={(similar ?? []) as Listing[]} />
}
