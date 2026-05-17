'use strict'
// scripts/pipeline-fill-report.js — fills in the per-stage metrics for
// the morning's pipeline report. Run AFTER pipeline_full.js completes:
//
//   node scripts/pipeline-fill-report.js [--run=<uuid>] [--out=<path>]
//
// Defaults to the most recent run_id and prints to stdout. The output is
// the markdown body to paste into reports/pipeline-{date}.md (or pipe
// via --out to overwrite the "To be filled in" section in place).

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

const SOURCES = [
  'syarah', 'soum', 'motory', 'yallamotor', 'gogomotor',
  'saudisale', 'carswitch', 'dubizzle', 'digitalcar',
]

function parseArgs () {
  const out = { runId: null, outPath: null }
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--run=')) out.runId = a.slice(6)
    else if (a.startsWith('--out=')) out.outPath = a.slice(6)
  }
  return out
}

function fmtNum (n) {
  if (n == null) return '—'
  return n.toLocaleString()
}

function fmtDur (sec) {
  if (sec == null) return '—'
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60), s = sec % 60
  return `${m}m${String(s).padStart(2, '0')}s`
}

async function main () {
  const { runId, outPath } = parseArgs()

  let resolvedRun = runId
  if (!resolvedRun) {
    const { data } = await sb.from('pipeline_runs')
      .select('run_id').order('started_at', { ascending: false }).limit(1)
    resolvedRun = data?.[0]?.run_id
    if (!resolvedRun) { console.error('No pipeline_runs rows.'); process.exit(1) }
  }

  const { data: rows, error } = await sb.from('pipeline_runs')
    .select('stage,source,status,metrics,notes,started_at,completed_at')
    .eq('run_id', resolvedRun)
    .order('started_at', { ascending: true })
  if (error) { console.error(error); process.exit(1) }

  // Per-source listing counts (active rows now, before counts come from notes/metrics).
  const sourceCounts = {}
  for (const s of SOURCES) {
    const { count } = await sb.from('listings')
      .select('*', { count: 'exact', head: true })
      .eq('source', s).eq('is_active', true).neq('freshness_state', 'dead')
    sourceCounts[s] = count ?? 0
  }
  const totalActive = Object.values(sourceCounts).reduce((a, b) => a + b, 0)

  // Baselines coverage.
  const { count: blTotal } = await sb.from('price_baselines')
    .select('*', { count: 'exact', head: true })
  const { count: blGood }  = await sb.from('price_baselines')
    .select('*', { count: 'exact', head: true }).gte('sample_size', 5)

  // Scoring distribution buckets.
  async function bucket (lo, hi) {
    let q = sb.from('listings').select('*', { count: 'exact', head: true })
      .eq('is_active', true).neq('freshness_state', 'dead')
      .not('deal_score', 'is', null)
    if (lo != null) q = q.gte('deal_score', lo)
    if (hi != null) q = q.lt('deal_score', hi)
    const { count } = await q
    return count ?? 0
  }
  const great = await bucket(9.0, null)
  const good  = await bucket(8.0, 9.0)
  const fair  = await bucket(7.0, 8.0)
  const low   = await bucket(0,   7.0)

  // Stage summary.
  console.log(`## Per-stage summary  (run_id=${resolvedRun})`)
  console.log()
  console.log('| Stage | Source | Status | Duration | Notes |')
  console.log('|---|---|---|---|---|')
  for (const r of rows) {
    const dur = r.completed_at
      ? Math.round((new Date(r.completed_at) - new Date(r.started_at)) / 1000)
      : null
    const note = (r.notes ?? '').replace(/\|/g, '\\|').slice(0, 80)
    console.log(`| ${r.stage} | ${r.source ?? '—'} | ${r.status} | ${fmtDur(dur)} | ${note} |`)
  }

  console.log()
  console.log('## Active counts (post-pipeline)')
  console.log()
  console.log('| Source | Active rows |')
  console.log('|---|---:|')
  for (const s of SOURCES) console.log(`| ${s} | ${fmtNum(sourceCounts[s])} |`)
  console.log(`| **TOTAL** | **${fmtNum(totalActive)}** |`)

  console.log()
  console.log('## Baselines coverage')
  console.log(`- Total \`price_baselines\` rows: **${fmtNum(blTotal)}**`)
  console.log(`- Rows with \`sample_size >= 5\`: **${fmtNum(blGood)}** (${blTotal ? Math.round((blGood / blTotal) * 100) : 0}%)`)

  console.log()
  console.log('## Scoring distribution')
  const scoreTotal = great + good + fair + low
  const pct = n => scoreTotal ? Math.round((n / scoreTotal) * 100) : 0
  console.log(`- great (≥ 9.0): **${fmtNum(great)}** (${pct(great)}%)`)
  console.log(`- good  (8.0–8.9): **${fmtNum(good)}** (${pct(good)}%)`)
  console.log(`- fair  (7.0–7.9): **${fmtNum(fair)}** (${pct(fair)}%)`)
  console.log(`- below 7.0: **${fmtNum(low)}** (${pct(low)}%)`)

  if (outPath) {
    fs.appendFileSync(outPath, '\n\n---\n\nGenerated by `scripts/pipeline-fill-report.js` at ' +
      new Date().toISOString() + '\n')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
