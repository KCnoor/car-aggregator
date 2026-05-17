import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Click-side freshness validation. The user-facing card fires this in the
// background when the user clicks "Open on <source>": if the source URL no
// longer resolves to a live ad, we mark the listing dead immediately so it
// disappears from future queries — without waiting for the nightly sweep.

export const runtime = 'nodejs'

// Server-only client (service role required to update the row).
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// Match the same dead-redirect heuristics as scripts/freshness_check.js.
const DEAD_REDIRECT_PATTERNS = [
  /^https?:\/\/[^/]+\/?(\?.*)?$/,
  /^https?:\/\/[^/]+\/(en|ar)\/?(\?.*)?$/,
  /\/(search|cars|used-cars|vehicles|listings|sale|browse)\/?(\?|$)/i,
  /\/(404|not-found|gone|removed|expired)\b/i,
  /haraj\.com\.sa\/?$/i,
  /haraj\.com\.sa\/(en|ar)\/?$/i,
]
function isDeadRedirect(finalUrl: string, original: string) {
  if (!finalUrl) return false
  if (finalUrl.replace(/\/$/, '') === original.replace(/\/$/, '')) return false
  for (const re of DEAD_REDIRECT_PATTERNS) if (re.test(finalUrl)) return true
  try {
    const o = new URL(original)
    const f = new URL(finalUrl)
    if (f.pathname === '/' || f.pathname === '') return true
    if (o.hostname !== f.hostname && f.pathname.length < 5) return true
  } catch { /* ignore */ }
  return false
}

export async function POST(req: NextRequest) {
  let body: { id?: string } = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const id = body.id
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'missing id' }, { status: 400 })
  }

  const { data: row, error } = await sb
    .from('listings')
    .select('id, source_url, freshness_state, last_checked_at')
    .eq('id', id)
    .single()
  if (error || !row || !row.source_url) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  // Throttle: don't re-check more than once per 10 minutes per listing.
  if (row.last_checked_at) {
    const age = Date.now() - new Date(row.last_checked_at).getTime()
    if (age < 10 * 60 * 1000) {
      return NextResponse.json({ verdict: row.freshness_state, cached: true })
    }
  }

  const ctrl = new AbortController()
  const to = setTimeout(() => ctrl.abort(), 10_000)
  let verdict: 'verified_active' | 'stale' | 'dead' = 'stale'
  let status = 0
  let reason: string | null = null
  try {
    let res = await fetch(row.source_url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': UA },
      signal: ctrl.signal,
    }).catch(() => null)
    if (!res || res.status === 405 || res.status === 403 || res.status === 501) {
      res = await fetch(row.source_url, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'User-Agent': UA },
        signal: ctrl.signal,
      })
    }
    status = res.status
    if (status === 404 || status === 410) {
      verdict = 'dead'
      reason = status === 410 ? 'gone' : 'http_404'
    } else if (status >= 200 && status < 300) {
      if (isDeadRedirect(res.url, row.source_url)) {
        verdict = 'dead'
        reason = 'redirect_home_or_search'
      } else {
        verdict = 'verified_active'
      }
    } else {
      verdict = 'stale'
      reason = `http_${status}`
    }
  } catch {
    verdict = 'stale'
    reason = 'transport_error'
  } finally {
    clearTimeout(to)
  }

  const now = new Date().toISOString()
  const update: Record<string, unknown> = {
    freshness_state: verdict,
    last_checked_at: now,
    last_http_status: status,
    dead_reason: verdict === 'dead' ? reason : null,
  }
  if (verdict === 'verified_active') update.last_verified_at = now
  if (verdict === 'dead') update.is_active = false
  await sb.from('listings').update(update).eq('id', id)

  return NextResponse.json({ verdict, status, reason })
}
