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

  const [totalRes, newRes] = await Promise.all([
    supabase.from('listings').select('*', { count: 'exact', head: true })
      .eq('is_active', true).neq('freshness_state', 'dead'),
    supabase.from('listings').select('*', { count: 'exact', head: true })
      .eq('is_active', true).neq('freshness_state', 'dead')
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
