'use strict'
// scripts/pipeline_status.js — print the last N pipeline runs as a table.
//
// One row per `npm run pipeline:refresh` invocation, grouped by run_id from
// pipeline_runs. For each: started time, total walltime, status of each
// stage, scrape drift summary (which sources warned), final active listing
// total.
//
// Usage:
//   node scripts/pipeline_status.js              # last 10 runs
//   node scripts/pipeline_status.js --limit=20
//   node scripts/pipeline_status.js --run=<uuid> # detailed view of one run

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const fs   = require('fs')
const path = require('path')

try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.replace(/^export\s+/, '').trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
    }
  }
} catch { /* not fatal */ }

const { createClient } = require('@supabase/supabase-js')
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

function parseArgs () {
  const args = { limit: 10, run: null }
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--limit=')) args.limit = parseInt(a.slice(8), 10) || 10
    else if (a.startsWith('--run=')) args.run = a.slice(6)
  }
  return args
}

function fmtDuration (ms) {
  if (!Number.isFinite(ms)) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60), r = s % 60
  return `${m}m${r ? `${r}s` : ''}`
}

function fmtDate (iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}

function fmtRelative (iso) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const days = Math.floor(ms / 86400000)
  if (days >= 1) return `${days}d ago`
  const hrs = Math.floor(ms / 3600000)
  if (hrs >= 1) return `${hrs}h ago`
  const mins = Math.floor(ms / 60000)
  return `${mins}m ago`
}

function pad (s, n) {
  s = String(s ?? '')
  // Always leave at least one space of separation so an over-long cell
  // doesn't visually merge with the next column.
  return s.length >= n ? s + '  ' : s + ' '.repeat(n - s.length)
}

// ── Detailed single-run view ─────────────────────────────────────────────────
async function showRun (runId) {
  const { data, error } = await sb.from('pipeline_runs')
    .select('*')
    .eq('run_id', runId)
    .order('id', { ascending: true })
  if (error) throw error
  if (!data.length) {
    console.error(`No rows for run_id ${runId}`)
    process.exit(1)
  }
  console.log(`\nRun ${runId}`)
  console.log(''.padEnd(78, '─'))
  for (const r of data) {
    const stage = r.source ? `${r.stage}:${r.source}` : r.stage
    const dur = r.completed_at
      ? fmtDuration(new Date(r.completed_at) - new Date(r.started_at))
      : 'running…'
    console.log(`${pad(stage, 22)} ${pad(r.status, 12)} ${pad(dur, 8)} ${fmtDate(r.started_at)}`)
    const m = r.metrics ?? {}
    const inlineKeys = Object.keys(m).filter(k => k !== 'drift')
    if (inlineKeys.length) {
      console.log(`  ${inlineKeys.map(k => `${k}=${JSON.stringify(m[k])}`).join(' · ')}`)
    }
    if (m.drift?.warning) {
      console.log(`  ⚠ drift: prior=${m.drift.prior_count} drop=${Math.round(m.drift.drop_pct * 100)}%`)
    }
    if (r.notes) console.log(`  notes: ${r.notes}`)
  }
}

// ── Run-summary list (default view) ──────────────────────────────────────────
async function showRecent (limit) {
  // Pull all rows in the recent window, grouped client-side by run_id.
  // We oversample so we can show `limit` distinct runs even if rows per run
  // vary. With ~6 stages per run, 6×limit is a comfortable cap.
  const { data, error } = await sb.from('pipeline_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(Math.max(60, limit * 12))
  if (error) throw error

  // Group by run_id, preserving insertion order (latest first).
  const groups = new Map()
  for (const r of data) {
    if (!groups.has(r.run_id)) groups.set(r.run_id, [])
    groups.get(r.run_id).push(r)
  }

  const runs = [...groups.entries()].slice(0, limit)

  if (!runs.length) {
    console.log('No pipeline runs recorded yet. Run `npm run pipeline:refresh`.')
    return
  }

  console.log(`\nLast ${runs.length} pipeline runs (newest first)\n`)
  console.log(pad('started', 22) + pad('walltime', 10) + pad('result', 10) + pad('stages', 18) + 'notes')
  console.log(''.padEnd(110, '─'))

  for (const [runId, rows] of runs) {
    // The summary row is stage='summary'. If absent the run was killed mid-flight.
    const summary = rows.find(r => r.stage === 'summary')
    const firstStarted = rows.reduce((a, r) =>
      !a || new Date(r.started_at) < new Date(a) ? r.started_at : a, null)
    const lastCompleted = rows.reduce((a, r) =>
      r.completed_at && (!a || new Date(r.completed_at) > new Date(a)) ? r.completed_at : a, null)

    const walltime = summary?.metrics?.total_walltime_ms
      ?? (lastCompleted && firstStarted
          ? new Date(lastCompleted) - new Date(firstStarted)
          : null)

    const result = summary
      ? summary.status
      : (rows.some(r => r.status === 'failed') ? 'failed'
         : rows.some(r => r.status === 'running') ? 'interrupted'
         : 'partial')

    // Compact per-stage tag with status.
    const stageOrder = ['scrape', 'normalize', 'freshness', 'baselines', 'score']
    const stageTag = stageOrder.map(s => {
      const matching = rows.filter(r => r.stage === s)
      if (!matching.length) return null
      const allOk = matching.every(r => r.status === 'success')
      const anyFailed = matching.some(r => r.status === 'failed')
      const mark = anyFailed ? '✗' : (allOk ? '✓' : '·')
      return `${s.slice(0, 4)}${mark}`
    }).filter(Boolean).join(' ')

    // Drift summary across scrape sub-rows.
    const driftSources = rows
      .filter(r => r.stage === 'scrape' && r.metrics?.drift?.warning)
      .map(r => `${r.source}-${Math.round(r.metrics.drift.drop_pct * 100)}%`)
    const noteParts = []
    if (summary?.metrics?.listings_active_total != null) {
      noteParts.push(`active=${summary.metrics.listings_active_total.toLocaleString()}`)
    }
    if (driftSources.length) noteParts.push(`drift: ${driftSources.join(', ')}`)
    if (!summary) noteParts.push(`run_id=${runId.slice(0, 8)}`)

    console.log(
      pad(`${fmtDate(firstStarted)} (${fmtRelative(firstStarted)})`, 22) +
      pad(fmtDuration(walltime), 10) +
      pad(result, 10) +
      pad(stageTag, 18) +
      noteParts.join(' · ')
    )
  }

  console.log('')
  console.log('Tip: `node scripts/pipeline_status.js --run=<uuid>` for per-stage details.')
}

;(async () => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env')
    process.exit(2)
  }
  const args = parseArgs()
  if (args.run) await showRun(args.run)
  else await showRecent(args.limit)
})().catch(e => { console.error(e); process.exit(1) })
