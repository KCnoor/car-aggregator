'use strict'
// scripts/pipeline_full.js — manual end-to-end data refresh.
//
// Stages, run sequentially (no parallelism — avoids cross-source contention
// and lets us see drift per source in real time):
//
//   1. scrape    — 9 scrapers, one at a time. Each writes a pipeline_runs
//                  row with before/after raw_listings counts + drift check.
//   2. normalize — ingests new raw rows into `listings`, recomputes red_flags.
//   3. freshness — HEAD-checks active listings, marks dead ones inactive.
//   4. baselines — recomputes price_baselines from current listings.
//   5. score     — writes deal_score_v2 / deal_score per active row.
//   6. summary   — one closing row with total walltime + per-stage status.
//
// Failure policy: any non-zero stage exit stops the pipeline. No skip, no
// recovery. The pipeline_runs row for that stage carries status='failed' and
// stderr in notes. Re-run after fixing the underlying issue.
//
// Usage:
//   node scripts/pipeline_full.js
//   node scripts/pipeline_full.js --skip-scrape       # for partial re-runs
//   node scripts/pipeline_full.js --only=normalize,score
//   node scripts/pipeline_full.js --sources=syarah,soum
//
// Idempotent stages (normalize, baselines, score, freshness) can be re-run
// without harm. The scrape stage will re-fetch list pages even on re-run.

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const fs    = require('fs')
const path  = require('path')
const { spawn } = require('child_process')
const crypto = require('crypto')

// ── Env loader (same shape as the other scripts) ─────────────────────────────
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

// ── Constants ────────────────────────────────────────────────────────────────
const SCRAPE_SOURCES = [
  'syarah', 'motory', 'yallamotor', 'gogomotor', 'saudisale',
  'soum', 'carswitch', 'dubizzle', 'digitalcar',
]
const DRIFT_THRESHOLD = 0.20  // 20% drop triggers WARNING
const REPO_ROOT = path.join(__dirname, '..')

// ── CLI args ─────────────────────────────────────────────────────────────────
function parseArgs () {
  const args = {
    skipScrape: false,
    only: null,           // optional Set of stage names
    sources: null,        // optional Set of source names
  }
  for (const a of process.argv.slice(2)) {
    if (a === '--skip-scrape') args.skipScrape = true
    else if (a.startsWith('--only=')) args.only = new Set(a.slice(7).split(','))
    else if (a.startsWith('--sources=')) args.sources = new Set(a.slice(10).split(','))
  }
  return args
}

// ── pipeline_runs helpers ────────────────────────────────────────────────────
async function startStage ({ runId, stage, source }) {
  const { data, error } = await sb.from('pipeline_runs').insert({
    run_id: runId, stage, source, status: 'running', metrics: {},
  }).select('id').single()
  if (error) throw new Error(`pipeline_runs insert failed: ${error.message}`)
  return data.id
}

async function finishStage (rowId, { status, metrics, notes }) {
  const { error } = await sb.from('pipeline_runs').update({
    status,
    completed_at: new Date().toISOString(),
    metrics: metrics ?? {},
    notes: notes ?? null,
  }).eq('id', rowId)
  if (error) console.error(`  ⚠ pipeline_runs update failed (id ${rowId}): ${error.message}`)
}

// ── Counts (Supabase head-count is cheap) ────────────────────────────────────
async function countRawForSource (source) {
  const { count, error } = await sb.from('raw_listings')
    .select('*', { count: 'exact', head: true })
    .eq('source', source)
  if (error) throw error
  return count ?? 0
}

async function countListingsForSource (source) {
  const { count, error } = await sb.from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('source', source)
    .eq('is_active', true)
  if (error) throw error
  return count ?? 0
}

async function countListingsTotal () {
  const { count, error } = await sb.from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
  if (error) throw error
  return count ?? 0
}

// ── Drift: prior run's raw_scraped count for this source ─────────────────────
async function priorScrapeCount (source) {
  const { data, error } = await sb.from('pipeline_runs')
    .select('metrics, completed_at')
    .eq('stage', 'scrape')
    .eq('source', source)
    .eq('status', 'success')
    .order('completed_at', { ascending: false })
    .limit(1)
  if (error) throw error
  const row = (data ?? [])[0]
  if (!row) return null
  const n = row.metrics?.raw_scraped_this_run
  return Number.isFinite(n) ? { count: n, at: row.completed_at } : null
}

// ── Spawn helper: pipes stdio so user sees real-time output ──────────────────
function runSubprocess (cmd, args, { cwd = REPO_ROOT } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit', env: process.env })
    child.on('error', reject)
    child.on('exit', (code, signal) => resolve({ code, signal }))
  })
}

// ── Stage banners ────────────────────────────────────────────────────────────
function banner (stage, source, what) {
  const label = source ? `${stage}:${source}` : stage
  console.log(`\n=== STAGE: ${label.toUpperCase()} === ${what}`)
}

function durationLabel (ms) {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60), r = s % 60
  return `${m}m${r ? `${r}s` : ''}`
}

// ── Scrape stage (per source) ────────────────────────────────────────────────
async function scrapeOne (runId, source) {
  banner('scrape', source, 'starting…')
  const startedAt = Date.now()
  const rowId = await startStage({ runId, stage: 'scrape', source })

  let rawBefore, rawAfter, listingsBefore
  try {
    listingsBefore = await countListingsForSource(source)
    rawBefore      = await countRawForSource(source)
  } catch (e) {
    await finishStage(rowId, { status: 'failed', metrics: {}, notes: `precount: ${e.message}` })
    throw e
  }

  const scriptPath = path.join('scripts', 'scrapers', `${source}.js`)
  const { code } = await runSubprocess('node', [scriptPath])
  const tookMs = Date.now() - startedAt

  if (code !== 0) {
    await finishStage(rowId, {
      status: 'failed',
      metrics: { exit_code: code, took_ms: tookMs, listings_before: listingsBefore, raw_before: rawBefore },
      notes: `scraper exited ${code}`,
    })
    banner('scrape', source, `FAILED (exit ${code}, ${durationLabel(tookMs)})`)
    throw new Error(`scrape:${source} failed (exit ${code})`)
  }

  try { rawAfter = await countRawForSource(source) }
  catch (e) {
    await finishStage(rowId, {
      status: 'failed',
      metrics: { exit_code: code, took_ms: tookMs, listings_before: listingsBefore, raw_before: rawBefore },
      notes: `postcount: ${e.message}`,
    })
    throw e
  }

  const newlyScraped = rawAfter - rawBefore

  // Drift check vs the latest prior successful run for this source.
  let drift = null
  const prior = await priorScrapeCount(source)
  if (prior && prior.count > 0) {
    const dropPct = (prior.count - newlyScraped) / prior.count
    drift = { prior_count: prior.count, prior_at: prior.at, drop_pct: +dropPct.toFixed(3) }
    if (dropPct >= DRIFT_THRESHOLD) {
      drift.warning = true
      console.log(`  ⚠ DRIFT WARNING: ${source} scraped ${newlyScraped} (prior ${prior.count}, -${Math.round(dropPct * 100)}%)`)
    }
  }

  const metrics = {
    exit_code: code,
    took_ms: tookMs,
    listings_before: listingsBefore,
    raw_before: rawBefore,
    raw_after: rawAfter,
    raw_scraped_this_run: newlyScraped,
    drift,
  }
  await finishStage(rowId, { status: 'success', metrics, notes: null })
  banner('scrape', source, `complete (${newlyScraped} new rows in raw_listings, ${durationLabel(tookMs)})`)
}

// ── Generic single-script stage ──────────────────────────────────────────────
async function runStage (runId, { stage, script, label, metricsFn }) {
  banner(stage, null, `starting (${label})…`)
  const startedAt = Date.now()
  const rowId = await startStage({ runId, stage, source: null })
  const { code } = await runSubprocess('node', [script])
  const tookMs = Date.now() - startedAt

  if (code !== 0) {
    await finishStage(rowId, {
      status: 'failed',
      metrics: { exit_code: code, took_ms: tookMs },
      notes: `${script} exited ${code}`,
    })
    banner(stage, null, `FAILED (exit ${code}, ${durationLabel(tookMs)})`)
    throw new Error(`${stage} failed (exit ${code})`)
  }

  let metrics = { exit_code: code, took_ms: tookMs }
  if (metricsFn) {
    try { metrics = { ...metrics, ...(await metricsFn()) } }
    catch (e) { console.error(`  ⚠ post-stage metrics failed: ${e.message}`) }
  }
  await finishStage(rowId, { status: 'success', metrics, notes: null })
  banner(stage, null, `complete (${durationLabel(tookMs)})`)
}

// ── Main ─────────────────────────────────────────────────────────────────────
;(async () => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env')
    process.exit(2)
  }

  const args = parseArgs()
  const runId = crypto.randomUUID()
  const pipelineStartedAt = Date.now()
  console.log(`\n══════════════════════════════════════════════════════════`)
  console.log(`  pipeline_full run_id=${runId}`)
  console.log(`  started=${new Date().toISOString()}`)
  console.log(`══════════════════════════════════════════════════════════`)

  const shouldRun = (name) => !args.only || args.only.has(name)
  const stageStatuses = {}

  try {
    if (!args.skipScrape && shouldRun('scrape')) {
      const sources = args.sources ? SCRAPE_SOURCES.filter(s => args.sources.has(s)) : SCRAPE_SOURCES
      for (const src of sources) {
        await scrapeOne(runId, src)
      }
      stageStatuses.scrape = 'success'
    }

    if (shouldRun('normalize')) {
      await runStage(runId, {
        stage: 'normalize',
        script: 'scripts/normalize.js',
        label: 'ingest raw → listings + red-flag backfill',
        metricsFn: async () => ({ listings_active_after: await countListingsTotal() }),
      })
      stageStatuses.normalize = 'success'
    }

    if (shouldRun('freshness')) {
      await runStage(runId, {
        stage: 'freshness',
        script: 'scripts/freshness_check.js',
        label: 'HEAD-check active source URLs',
      })
      stageStatuses.freshness = 'success'
    }

    if (shouldRun('baselines')) {
      await runStage(runId, {
        stage: 'baselines',
        script: 'scripts/compute_baselines.js',
        label: 'recompute price_baselines',
      })
      stageStatuses.baselines = 'success'
    }

    if (shouldRun('score')) {
      await runStage(runId, {
        stage: 'score',
        script: 'scripts/score.js',
        label: 'write deal_score / deal_score_v2',
      })
      stageStatuses.score = 'success'
    }

    // Final summary row.
    const totalMs = Date.now() - pipelineStartedAt
    const finalActive = await countListingsTotal()
    const summaryRow = await startStage({ runId, stage: 'summary', source: null })
    await finishStage(summaryRow, {
      status: 'success',
      metrics: {
        total_walltime_ms: totalMs,
        stages: stageStatuses,
        listings_active_total: finalActive,
      },
      notes: null,
    })

    console.log(`\n══════════════════════════════════════════════════════════`)
    console.log(`  pipeline complete in ${durationLabel(totalMs)}`)
    console.log(`  active listings: ${finalActive.toLocaleString()}`)
    console.log(`  run_id=${runId}`)
    console.log(`══════════════════════════════════════════════════════════`)
  } catch (e) {
    const totalMs = Date.now() - pipelineStartedAt
    console.error(`\n!! pipeline aborted after ${durationLabel(totalMs)}: ${e.message}`)
    const failRow = await startStage({ runId, stage: 'summary', source: null }).catch(() => null)
    if (failRow) {
      await finishStage(failRow, {
        status: 'failed',
        metrics: { total_walltime_ms: totalMs, stages: stageStatuses },
        notes: e.message,
      })
    }
    process.exit(1)
  }
})()
