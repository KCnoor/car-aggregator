'use strict'
// Weekly coverage audit. For 10 popular (make, model) combinations, log
// today's active count per (source, make, model) and compute a delta against
// yesterday's snapshot (if any). Snapshots live in the `coverage_snapshots`
// table — see supabase/migrate-v8.sql.
//
// Usage:
//   node scripts/coverage-audit.js
//
// Schedule via the same GitHub Actions workflow as freshness sweep, or run
// manually any time. Reading is cheap (1 query); writes one row per
// (source, make, model) tuple per run.

const fs = require('fs')
for (const line of fs.readFileSync('/Users/kaisinoureddin/car-aggregator/.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.replace(/^export\s+/, '').trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
}

const { createClient } = require('/Users/kaisinoureddin/car-aggregator/node_modules/@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Top 10 (make, model) combos to track. Picked to span common-volume and
// long-tail; tweak as needed.
const COMBOS = [
  ['toyota', 'corolla'],
  ['toyota', 'camry'],
  ['toyota', 'land-cruiser'],
  ['hyundai', 'sonata'],
  ['hyundai', 'elantra'],
  ['nissan', 'patrol'],
  ['nissan', 'sunny'],
  ['ford', 'taurus'],
  ['chevrolet', 'tahoe'],
  ['lexus', 'lx'],
]

async function countFor (source, make, model) {
  const { count, error } = await sb.from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('source', source)
    .eq('make_slug', make)
    .eq('model_slug', model)
    .eq('is_active', true)
    .neq('freshness_state', 'dead')
  if (error) throw error
  return count ?? 0
}

async function listSources () {
  const { data } = await sb.from('listings').select('source').eq('is_active', true).limit(50_000)
  return [...new Set(data.map(r => r.source))]
}

;(async () => {
  const sources = await listSources()
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  console.log(`Coverage audit ${today} — ${COMBOS.length} combos × ${sources.length} sources`)
  console.log('')

  // Fetch most recent prior snapshot per (source, make, model) for delta calc.
  // We fetch up to 7 days back to be tolerant of missed runs.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const { data: priorRows } = await sb.from('coverage_snapshots')
    .select('source, make_slug, model_slug, snapshot_date, active_count')
    .gte('snapshot_date', sevenDaysAgo)
    .lt('snapshot_date', today)
    .order('snapshot_date', { ascending: false })
  const priorMap = new Map()
  for (const r of priorRows ?? []) {
    const k = `${r.source}|${r.make_slug}|${r.model_slug}`
    if (!priorMap.has(k)) priorMap.set(k, r) // first = most recent due to ordering
  }

  const rows = []
  for (const [make, model] of COMBOS) {
    let comboLine = `${make.padEnd(12)} ${model.padEnd(16)}`
    let comboTotal = 0
    for (const source of sources) {
      const cnt = await countFor(source, make, model)
      if (cnt === 0) continue
      comboTotal += cnt
      const prior = priorMap.get(`${source}|${make}|${model}`)
      const delta = prior ? cnt - prior.active_count : null
      const deltaStr = delta === null ? '—' : (delta >= 0 ? `+${delta}` : `${delta}`)
      comboLine += `\n  ${source.padEnd(12)} ${String(cnt).padStart(4)}  Δ${deltaStr.padStart(5)}` +
                   (prior ? ` (vs ${prior.snapshot_date})` : '')
      rows.push({
        snapshot_date: today, source, make_slug: make, model_slug: model, active_count: cnt,
      })
    }
    comboLine += `\n  ${'TOTAL'.padEnd(12)} ${String(comboTotal).padStart(4)}`
    console.log(comboLine)
    console.log('')
  }

  // Upsert today's snapshot (idempotent on PK (snapshot_date, source, make_slug, model_slug)).
  if (rows.length) {
    const { error } = await sb.from('coverage_snapshots').upsert(rows, {
      onConflict: 'snapshot_date,source,make_slug,model_slug',
    })
    if (error) {
      console.error('snapshot insert failed:', error.message)
      console.error('Did you apply supabase/migrate-v8.sql? It creates coverage_snapshots.')
      process.exit(1)
    }
    console.log(`Wrote ${rows.length} snapshot rows.`)
  }

  // Big-delta alerts: any single (source, make, model) that lost ≥20% or 10+ listings.
  const alerts = []
  for (const r of rows) {
    const prior = priorMap.get(`${r.source}|${r.make_slug}|${r.model_slug}`)
    if (!prior) continue
    const drop = prior.active_count - r.active_count
    if (drop >= 10 && drop / prior.active_count >= 0.20) {
      alerts.push({ ...r, prior_count: prior.active_count, prior_date: prior.snapshot_date, drop })
    }
  }
  if (alerts.length) {
    console.log('\n⚠️  Big drops since last snapshot:')
    for (const a of alerts) {
      console.log(`  ${a.source} ${a.make_slug}/${a.model_slug}: ${a.prior_count} → ${a.active_count}  (-${a.drop})`)
    }
    console.log('Investigate the scraper for that source — may be silently degraded.')
  }
})().catch(e => { console.error(e); process.exit(1) })
