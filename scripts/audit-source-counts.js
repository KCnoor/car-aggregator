'use strict'
// scripts/audit-source-counts.js — count active rows by source.
// One-off audit helper for the overnight pass.

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

async function main () {
  const sources = [
    'syarah','soum','carswitch','digitalcar','motory','yallamotor',
    'gogomotor','saudisale','dubizzle','haraj','carly',
  ]
  const rows = []
  for (const s of sources) {
    const { count } = await sb.from('listings')
      .select('*', { count: 'exact', head: true })
      .eq('source', s)
      .eq('is_active', true)
      .neq('freshness_state', 'dead')
    rows.push({ source: s, active: count ?? 0 })
  }
  rows.sort((a, b) => b.active - a.active)
  for (const r of rows) console.log(`  ${r.source.padEnd(12)} ${r.active}`)
  const total = rows.reduce((s, r) => s + r.active, 0)
  console.log(`  ${'TOTAL'.padEnd(12)} ${total}`)
}

main().catch(e => { console.error(e); process.exit(1) })
