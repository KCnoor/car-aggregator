import { supabase, type Listing } from '@/lib/supabase'
import MatchClient, { type PersonaKey } from './MatchClient'

// الخطّابة — v0 handcrafted (no AI yet). Seven personas after the
// 2026-05-17 trim (investment dropped, city_only merged into first_car).
// All queries exclude needs_make_review rows so unmapped long-tail noise
// never surfaces in a curated set.
export const dynamic = 'force-dynamic'

const PER_PERSONA_LIMIT = 12

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
  const [
    bigFamily, firstCar, upgrade,
    longTrip, economical, luxury, adventure,
  ] = await Promise.all<Listing[]>([
    // عائلة كبيرة — SUV / minivan, recent, low-mid mileage.
    loadPersona(q => q
      .in('body_type_slug', ['suv', 'minivan'])
      .gte('year', 2018)
      .lte('mileage_km', 150000)
      .gte('deal_score', 7.0)
    ),
    // أول سيارة (now absorbs the former 'مدينة فقط' persona): under
    // 50k, mass-market makes, sedan/hatchback so the city-friendly
    // body types surface, recent, good score.
    loadPersona(q => q
      .lte('price_sar', 50000)
      .gte('price_sar', 15000)
      .in('make_slug', ['toyota', 'hyundai', 'kia', 'nissan', 'honda', 'mazda', 'suzuki'])
      .in('body_type_slug', ['sedan', 'hatchback'])
      .gte('year', 2017)
      .lte('mileage_km', 180000)
      .gte('deal_score', 7.5)
    ),
    // ترقية — 100-200k, premium makes, recent, low mileage.
    loadPersona(q => q
      .gte('price_sar', 100000)
      .lte('price_sar', 200000)
      .in('make_slug', ['mercedes-benz', 'bmw', 'audi', 'lexus', 'porsche', 'land-rover', 'genesis', 'cadillac'])
      .gte('year', 2020)
      .lte('mileage_km', 80000)
      .gte('deal_score', 7.0)
    ),
    // سفر طويل — comfortable highway cars, sedans, low-ish mileage.
    loadPersona(q => q
      .in('body_type_slug', ['sedan', 'suv'])
      .in('make_slug', ['toyota', 'honda', 'hyundai', 'kia', 'lexus', 'mazda', 'nissan'])
      .gte('year', 2019)
      .lte('mileage_km', 100000)
      .lte('price_sar', 150000)
      .gte('deal_score', 7.5)
    ),
    // اقتصادي — cheapest reliable, mass-market, score >= 7.
    loadPersona(q => q
      .lte('price_sar', 35000)
      .in('make_slug', ['toyota', 'hyundai', 'kia', 'nissan', 'suzuki'])
      .gte('deal_score', 7.0)
    ),
    // فخامة — 200k+, top-tier brands, near-new.
    loadPersona(q => q
      .gte('price_sar', 200000)
      .in('make_slug', ['mercedes-benz', 'bmw', 'porsche', 'rolls-royce', 'bentley', 'land-rover', 'lamborghini', 'ferrari', 'maserati', 'lexus'])
      .gte('year', 2021)
      .lte('mileage_km', 60000)
      .gte('deal_score', 7.0)
    ),
    // مغامرة — 4x4 SUVs / pickups built for off-road.
    loadPersona(q => q
      .in('body_type_slug', ['suv', 'pickup'])
      .in('make_slug', ['toyota', 'jeep', 'land-rover', 'ford', 'nissan', 'chevrolet', 'gmc'])
      .gte('year', 2019)
      .gte('deal_score', 7.5)
    ),
  ])

  const personas: Record<PersonaKey, Listing[]> = {
    big_family:  bigFamily,
    first_car:   firstCar,
    upgrade,
    long_trip:   longTrip,
    economical,
    luxury,
    adventure,
  }

  return <MatchClient personas={personas} />
}
