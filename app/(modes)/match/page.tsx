import { supabase, type Listing } from '@/lib/supabase'
import MatchClient from './MatchClient'

// Personas resolve to live DB queries — always pick the freshest set.
export const dynamic = 'force-dynamic'

// الخطّابة — v0 (handcrafted, no AI). Three personas surface
// rule-curated listings from the live DB. Each persona has a query that
// reflects its profile and a sentence explaining why a given listing is
// a good fit. Real AI matching comes later; the user-provided
// "this isn't quite me" feedback feeds that effort.

const PER_PERSONA_LIMIT = 12

// Supabase JS filter-chain types are complex generics; an `any` for the
// builder passed to `apply` keeps the persona definitions readable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadPersona (apply: (q: any) => any): Promise<Listing[]> {
  let q = supabase.from('listings')
    .select('*')
    .eq('is_active', true)
    .neq('freshness_state', 'dead')
    .neq('needs_make_review', true)
    .not('price_sar', 'is', null)
    .order('deal_score', { ascending: false, nullsFirst: false })
    .limit(PER_PERSONA_LIMIT)
  q = apply(q)
  const { data, error } = await q
  if (error) {
    console.error('match persona load:', error.message)
    return []
  }
  return (data ?? []) as Listing[]
}

export default async function MatchPage () {
  // Persona queries — kept declarative + lightweight. Tunable without
  // touching the client component.
  const [bigFamily, firstCar, upgrade] = await Promise.all([
    // عائلة كبيرة — 7+ seats OR SUV/minivan body type. Filter for known
    // people-movers via popular high-capacity models when seats data is null.
    loadPersona(q => q
      .in('body_type_slug', ['suv', 'minivan'])
      .gte('year', 2018)
      .lte('mileage_km', 150000)
      .gte('deal_score', 7.0)
    ),
    // أول سيارة — under 50k, reliable mass-market makes, low-ish mileage,
    // reasonably new.
    loadPersona(q => q
      .lte('price_sar', 50000)
      .gte('price_sar', 15000)
      .in('make_slug', ['toyota', 'hyundai', 'kia', 'nissan', 'honda', 'mazda', 'suzuki'])
      .gte('year', 2017)
      .lte('mileage_km', 180000)
      .gte('deal_score', 7.5)
    ),
    // ترقية — 100k+, premium makes, low mileage, modern year.
    loadPersona(q => q
      .gte('price_sar', 100000)
      .in('make_slug', ['mercedes-benz', 'bmw', 'audi', 'lexus', 'porsche', 'land-rover', 'genesis', 'cadillac'])
      .gte('year', 2020)
      .lte('mileage_km', 80000)
      .gte('deal_score', 7.0)
    ),
  ])

  return (
    <MatchClient
      personas={{
        big_family: bigFamily,
        first_car:  firstCar,
        upgrade,
      }}
    />
  )
}
