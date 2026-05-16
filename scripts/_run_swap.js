'use strict'
// Final swap: copy deal_score_v2 → deal_score (and score_source_v2 → score_source)
// for every active listing where deal_score_v2 is non-null.
//
// Idempotent. Run AFTER user explicit approval — gated by --confirm flag.

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
} catch {}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

if (!process.argv.includes('--confirm')) {
  console.error('Refusing to run without --confirm flag.')
  process.exit(1)
}

const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const PAGE = 1000
const UPDATE_CONCURRENCY = 20

;(async () => {
  const t0 = Date.now()
  console.log('Loading rows with deal_score_v2…')
  const rows = []
  let offset = 0
  for (;;) {
    const { data, error } = await sb.from('listings')
      .select('id, deal_score_v2, score_source_v2')
      .not('deal_score_v2', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    rows.push(...data)
    process.stdout.write(`  loaded ${rows.length}\r`)
    if (data.length < PAGE) break
    offset += data.length
  }
  process.stdout.write('\n')
  console.log(`Total to swap: ${rows.length}`)

  let written = 0
  const errors = []
  for (let i = 0; i < rows.length; i += UPDATE_CONCURRENCY) {
    const batch = rows.slice(i, i + UPDATE_CONCURRENCY)
    await Promise.all(batch.map(async (r) => {
      const { error } = await sb.from('listings').update({
        deal_score:   r.deal_score_v2,
        score_source: r.score_source_v2,
      }).eq('id', r.id)
      if (error) errors.push(`${r.id}: ${error.message}`)
      else written++
    }))
    if (i % 500 < UPDATE_CONCURRENCY) process.stdout.write(`  swapped ${written}/${rows.length}\r`)
  }
  process.stdout.write('\n')

  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  console.log(`  swapped: ${written}`)
  console.log(`  errors:  ${errors.length}`)
  if (errors.length > 0) for (const e of errors.slice(0, 10)) console.log(`    ${e}`)
})().catch(e => { console.error(e); process.exit(1) })
