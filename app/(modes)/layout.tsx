import { supabase } from '@/lib/supabase'
import ModesShell from './ModesShell'

// Server-side layout shell: fetches the listing counters once per request
// so the sticky header pill always reflects live data, then hands off to
// the client shell that owns the lang context + cross-fade animation.
//
// The counters are not in any client state — refresh to update.
export const dynamic = 'force-dynamic'

export default async function ModesLayout ({ children }: { children: React.ReactNode }) {
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

  // Under-15k SAR listings are filtered out at the display layer (typos /
  // motorcycle entries / "contact me" price signals — they drag perceived
  // data quality down). They stay in the DB so a corrected re-scrape can
  // bring them back without manual intervention.
  const [totalRes, newRes] = await Promise.all([
    supabase.from('listings').select('*', { count: 'exact', head: true })
      .eq('is_active', true).neq('freshness_state', 'dead')
      .gte('price_sar', 15000),
    supabase.from('listings').select('*', { count: 'exact', head: true })
      .eq('is_active', true).neq('freshness_state', 'dead')
      .gte('price_sar', 15000)
      .gte('first_seen_at', since24h),
  ])

  return (
    <ModesShell
      totalCount={totalRes.count ?? 0}
      newDealsCount={newRes.count ?? 0}
    >
      {children}
    </ModesShell>
  )
}
