'use strict'
// Daily freshness sweep.
//
// Iterates active listings, issues a polite HEAD (with GET fallback) against
// each source_url, and classifies the result. Writes back to the `listings`
// table:
//   freshness_state   verified_active | stale | unverified | dead
//   last_checked_at   timestamp of this check (always written)
//   last_verified_at  set only when the URL resolved to a live detail page
//   last_http_status  raw status code we got (or 0 on transport error)
//   dead_reason       short tag explaining a 'dead' verdict (404, redirect_home, ...)
//   is_active         set to FALSE when freshness_state transitions to 'dead'
//
// Politeness: per-source delay floor (default 800ms between requests to the
// same host), enforced via a per-source last-hit timestamp. We run N=8 workers
// in parallel and pick the next URL from any source whose floor has elapsed,
// so total throughput is ~6-8 req/s with zero source hit faster than 1/800ms.
// User agent is rotated per request from a small pool.
//
// Usage:
//   node scripts/freshness_check.js                # sweep everything that
//                                                  # hasn't been checked in 20h
//   node scripts/freshness_check.js --limit=500    # cap rows touched
//   node scripts/freshness_check.js --source=haraj # one source only
//   node scripts/freshness_check.js --ids=a,b,c    # specific IDs (on-demand
//                                                  # API path)

const fs = require('fs')
for (const line of fs.readFileSync('/Users/kaisinoureddin/car-aggregator/.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.replace(/^export\s+/, '').trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
}
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const { createClient } = require('/Users/kaisinoureddin/car-aggregator/node_modules/@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// ── User-agent pool ──────────────────────────────────────────────────────────
const UA_POOL = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
]
const pickUA = () => UA_POOL[Math.floor(Math.random() * UA_POOL.length)]
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── Dead-redirect heuristics ────────────────────────────────────────────────
// When a sold/removed listing 302→ to a homepage or search-results page, we
// treat that as dead. The patterns below must match the *final* URL after
// redirects (fetch follows them by default).
const DEAD_REDIRECT_PATTERNS = [
  /^https?:\/\/[^/]+\/?(\?.*)?$/,                                // bare root
  /^https?:\/\/[^/]+\/(en|ar)\/?(\?.*)?$/,                       // lang root
  /\/(search|cars|used-cars|vehicles|listings|sale|browse)\/?(\?|$)/i,
  /\/(404|not-found|gone|removed|expired)\b/i,
  /haraj\.com\.sa\/?$/i,
  /haraj\.com\.sa\/(en|ar)\/?$/i,
]
function isDeadRedirect (finalUrl, originalUrl) {
  if (!finalUrl) return false
  // Same URL = no redirect = not dead by redirect.
  if (finalUrl.replace(/\/$/, '') === originalUrl.replace(/\/$/, '')) return false
  // Final URL is a homepage / search page → dead.
  for (const re of DEAD_REDIRECT_PATTERNS) if (re.test(finalUrl)) return true
  // Final URL host differs from original host *and* lost the path → dead.
  try {
    const o = new URL(originalUrl)
    const f = new URL(finalUrl)
    if (f.pathname === '/' || f.pathname === '') return true
    if (o.hostname !== f.hostname && f.pathname.length < 5) return true
  } catch { /* ignore */ }
  return false
}

// ── Per-listing check ────────────────────────────────────────────────────────
async function checkOne (url, { timeoutMs = 10000 } = {}) {
  const ctrl = new AbortController()
  const to = setTimeout(() => ctrl.abort('timeout'), timeoutMs)
  const headers = { 'User-Agent': pickUA(), 'Accept-Language': 'en;q=0.9,ar;q=0.8' }
  try {
    // Try HEAD first (cheaper). Many sites reject HEAD with 405; fall back to GET.
    let res
    try {
      res = await fetch(url, { method: 'HEAD', redirect: 'follow', headers, signal: ctrl.signal })
      if (res.status === 405 || res.status === 403 || res.status === 501) {
        res = await fetch(url, { method: 'GET', redirect: 'follow', headers, signal: ctrl.signal })
      }
    } catch (_e) {
      res = await fetch(url, { method: 'GET', redirect: 'follow', headers, signal: ctrl.signal })
    }
    const finalUrl = res.url
    const status = res.status
    if (status === 404 || status === 410) {
      return { status, verdict: 'dead', reason: status === 410 ? 'gone' : 'http_404' }
    }
    if (status >= 500) {
      // Treat as inconclusive; do not mark dead on a transient server error.
      return { status, verdict: 'stale', reason: `http_${status}` }
    }
    if (status >= 400) {
      // 401/403/etc. — site is gating; inconclusive.
      return { status, verdict: 'stale', reason: `http_${status}` }
    }
    if (status >= 200 && status < 300) {
      if (isDeadRedirect(finalUrl, url)) {
        return { status, verdict: 'dead', reason: 'redirect_home_or_search', finalUrl }
      }
      return { status, verdict: 'verified_active', reason: null, finalUrl }
    }
    return { status, verdict: 'stale', reason: `http_${status}` }
  } catch (e) {
    const msg = (e && (e.message || e)) + ''
    return { status: 0, verdict: 'stale', reason: 'transport:' + msg.slice(0, 40) }
  } finally {
    clearTimeout(to)
  }
}

// ── Source-bucketed concurrent runner ────────────────────────────────────────
// N workers pop from per-source FIFOs. A worker only picks a URL when the
// source's last-hit timestamp is older than `perSourceDelayMs`. Net effect:
//   - any single host is hit at most every 800ms
//   - total throughput scales with the number of distinct sources active
// For 9 sources × 1.25 req/s/source ≈ 11 req/s aggregate, plenty fast.
const PER_SOURCE_DELAY_MS = 800
const WORKERS = 8

function bucketize (rows) {
  const buckets = new Map()
  for (const r of rows) {
    if (!buckets.has(r.source)) buckets.set(r.source, [])
    buckets.get(r.source).push(r)
  }
  return buckets
}

// ── Main sweep ───────────────────────────────────────────────────────────────
function parseArgs () {
  const args = { limit: null, source: null, ids: null, ageHours: 20 }
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--limit=')) args.limit = parseInt(a.slice(8), 10)
    else if (a.startsWith('--source=')) args.source = a.slice(9)
    else if (a.startsWith('--ids=')) args.ids = a.slice(6).split(',').filter(Boolean)
    else if (a.startsWith('--age-hours=')) args.ageHours = parseFloat(a.slice(12))
  }
  return args
}

async function loadRows (args) {
  // Always operate on currently-active listings with a source_url.
  let q = sb.from('listings')
    .select('id, source, source_url, freshness_state, last_checked_at')
    .eq('is_active', true)
    .not('source_url', 'is', null)

  if (args.ids) q = q.in('id', args.ids)
  else if (args.source) q = q.eq('source', args.source)

  // Skip rows checked recently (unless --ids).
  if (!args.ids && args.ageHours > 0) {
    const cutoff = new Date(Date.now() - args.ageHours * 3600 * 1000).toISOString()
    q = q.or(`last_checked_at.is.null,last_checked_at.lt.${cutoff}`)
  }

  // Pull in batches (PostgREST caps at 1000).
  const batch = 1000
  const out = []
  let from = 0
  while (true) {
    const { data, error } = await q.range(from, from + batch - 1)
    if (error) throw error
    out.push(...data)
    if (data.length < batch) break
    from += batch
    if (args.limit && out.length >= args.limit) break
  }
  return args.limit ? out.slice(0, args.limit) : out
}

async function writeOne (id, verdict, status, reason) {
  const now = new Date().toISOString()
  const update = {
    freshness_state: verdict,
    last_checked_at: now,
    last_http_status: status,
    dead_reason: verdict === 'dead' ? reason : null,
  }
  if (verdict === 'verified_active') update.last_verified_at = now
  if (verdict === 'dead') update.is_active = false
  const { error } = await sb.from('listings').update(update).eq('id', id)
  if (error) throw error
}

;(async () => {
  const args = parseArgs()
  console.log('args:', args)
  const rows = await loadRows(args)
  const buckets = bucketize(rows)
  console.log(`Sweeping ${rows.length} listings across ${buckets.size} sources with ${WORKERS} workers (per-source floor ${PER_SOURCE_DELAY_MS}ms)…`)
  if (rows.length === 0) return

  const counts = { verified_active: 0, stale: 0, dead: 0, error: 0 }
  const deadBySource = {}
  const startedAt = Date.now()
  const lastHit = new Map() // source -> ts of last request
  let done = 0
  const totalRows = rows.length

  // Pick the next runnable URL from any non-empty bucket whose floor has
  // elapsed. Returns { source, row, waitMs } or null if everything is empty.
  function pickNext () {
    let bestSource = null
    let bestWait = Infinity
    const now = Date.now()
    for (const [src, q] of buckets) {
      if (q.length === 0) continue
      const last = lastHit.get(src) ?? 0
      const wait = Math.max(0, last + PER_SOURCE_DELAY_MS - now)
      if (wait < bestWait) { bestWait = wait; bestSource = src }
    }
    if (bestSource == null) return null
    const row = buckets.get(bestSource).shift()
    return { source: bestSource, row, waitMs: bestWait }
  }

  async function worker () {
    while (true) {
      const picked = pickNext()
      if (!picked) return
      if (picked.waitMs > 0) await sleep(picked.waitMs)
      lastHit.set(picked.source, Date.now())
      const r = await checkOne(picked.row.source_url)
      counts[r.verdict] = (counts[r.verdict] ?? 0) + 1
      if (r.verdict === 'dead') {
        deadBySource[picked.source] = (deadBySource[picked.source] ?? 0) + 1
      }
      try {
        await writeOne(picked.row.id, r.verdict, r.status, r.reason)
      } catch (e) {
        counts.error++
        if (counts.error <= 5) console.error(`  write fail ${picked.row.id}: ${e.message}`)
      }
      done++
      if (done % 200 === 0 || done === totalRows) {
        const elapsed = Math.round((Date.now() - startedAt) / 1000)
        const rate = Math.round(done / Math.max(1, elapsed) * 60)
        const eta = elapsed > 0 ? Math.round((totalRows - done) / (done / elapsed)) : 0
        console.log(`  [${done}/${totalRows}] verified=${counts.verified_active} dead=${counts.dead} stale=${counts.stale} err=${counts.error} (${elapsed}s @ ${rate}/min, eta ${eta}s)`)
      }
    }
  }

  await Promise.all(Array.from({ length: WORKERS }, () => worker()))

  console.log('\n── Sweep complete ──')
  console.log('Totals:', counts)
  console.log('Dead by source:', deadBySource)
  const sec = Math.round((Date.now() - startedAt) / 1000)
  console.log(`Elapsed: ${sec}s (~${Math.round(totalRows / sec * 60)} listings/min)`)
})().catch(e => { console.error(e); process.exit(1) })
