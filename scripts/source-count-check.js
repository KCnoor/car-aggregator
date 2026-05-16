'use strict'
// One-shot coverage helper.
// Usage:
//   node scripts/source-count-check.js make=toyota model=corolla
//   node scripts/source-count-check.js make=toyota
//   node scripts/source-count-check.js make=toyota model=camry source=syarah
//
// Prints the row count in `listings` for that (make, model) tuple, split by
// source and by is_active so you can compare against what the source's own
// search results page shows when you browse it manually.

const fs = require('fs')
for (const line of fs.readFileSync('/Users/kaisinoureddin/car-aggregator/.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.replace(/^export\s+/, '').trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
}

const { createClient } = require('/Users/kaisinoureddin/car-aggregator/node_modules/@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

function parseArgs () {
  const args = {}
  for (const a of process.argv.slice(2)) {
    const [k, v] = a.split('=')
    if (k && v) args[k] = v.toLowerCase()
  }
  return args
}

;(async () => {
  const args = parseArgs()
  if (!args.make) {
    console.error('Usage: node scripts/source-count-check.js make=toyota [model=corolla] [source=syarah]')
    process.exit(2)
  }
  console.log(`Querying: make=${args.make}${args.model ? ' model=' + args.model : ''}${args.source ? ' source=' + args.source : ''}`)

  // Pull all matching rows (no count filter — we need source breakdown).
  let q = sb.from('listings').select('source, is_active, freshness_state, year').eq('make_slug', args.make)
  if (args.model) q = q.eq('model_slug', args.model)
  if (args.source) q = q.eq('source', args.source)

  // Paginate to dodge the 1000-row cap.
  const all = []
  let from = 0
  while (true) {
    const { data, error } = await q.range(from, from + 999)
    if (error) throw error
    all.push(...data)
    if (data.length < 1000) break
    from += 1000
  }

  console.log(`\nTotal matching rows in DB: ${all.length}`)

  // Breakdown by source × is_active.
  const bySource = {}
  for (const r of all) {
    const s = r.source
    if (!bySource[s]) bySource[s] = { active: 0, dead: 0, inactive_other: 0 }
    if (r.is_active) bySource[s].active++
    else if (r.freshness_state === 'dead') bySource[s].dead++
    else bySource[s].inactive_other++
  }

  console.log('\n── Per-source breakdown ──')
  console.log('source         active   dead   other(inactive)')
  const sources = Object.keys(bySource).sort()
  let totalActive = 0
  for (const s of sources) {
    const b = bySource[s]
    totalActive += b.active
    console.log(`${s.padEnd(14)} ${String(b.active).padStart(6)}   ${String(b.dead).padStart(4)}   ${String(b.inactive_other).padStart(6)}`)
  }
  console.log(`${'TOTAL'.padEnd(14)} ${String(totalActive).padStart(6)} active`)

  // Year distribution (active only).
  const byYear = {}
  for (const r of all) if (r.is_active && r.year) byYear[r.year] = (byYear[r.year] ?? 0) + 1
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a).slice(0, 12)
  if (years.length) {
    console.log('\n── Active by year (top 12) ──')
    for (const y of years) console.log(`  ${y}  ${byYear[y]}`)
  }
})().catch(e => { console.error(e); process.exit(1) })
