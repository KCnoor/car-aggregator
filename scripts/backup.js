'use strict'
// scripts/backup.js
// Exports the full contents of every Supabase table relevant to the refactor
// to backups/{table}-backup-{ISO}.json. Pages through 1000 rows at a time.
// Run: node scripts/backup.js

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
} catch { /* shell env takes priority */ }

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('ERROR: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const { createClient } = require('@supabase/supabase-js')
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-')
const BACKUP_DIR = path.join(__dirname, '..', 'backups')
fs.mkdirSync(BACKUP_DIR, { recursive: true })

// Tables to back up if they exist
const TABLES = ['listings', 'raw_listings', 'price_baselines', 'valuation_cache']

async function tableExists (name) {
  const { error } = await sb.from(name).select('*', { count: 'exact', head: true })
  if (!error) return true
  // 42P01 = undefined_table; PGRST205 also indicates missing
  if (error.code === '42P01' || error.code === 'PGRST205' || /not exist|not found|schema cache/i.test(error.message || '')) return false
  throw new Error(`probing ${name}: ${error.message}`)
}

async function exportTable (name) {
  const exists = await tableExists(name)
  if (!exists) return { name, skipped: true }

  const file = path.join(BACKUP_DIR, `${name}-backup-${TIMESTAMP}.json`)
  const stream = fs.createWriteStream(file)
  stream.write('[\n')

  const PAGE = 1000
  let offset = 0
  let total = 0
  let first = true

  for (;;) {
    const { data, error } = await sb
      .from(name)
      .select('*')
      .range(offset, offset + PAGE - 1)
      .order('id', { ascending: true })

    if (error) throw new Error(`reading ${name} at offset ${offset}: ${error.message}`)
    if (!data || data.length === 0) break

    for (const row of data) {
      if (!first) stream.write(',\n')
      stream.write(JSON.stringify(row))
      first = false
    }
    total += data.length
    offset += data.length
    process.stdout.write(`  ${name}: exported ${total}\r`)
    if (data.length < PAGE) break
  }

  stream.write('\n]\n')
  await new Promise(resolve => stream.end(resolve))
  process.stdout.write('\n')

  const stat = fs.statSync(file)
  return { name, file, size: stat.size, rows: total }
}

;(async () => {
  console.log(`Backup timestamp: ${TIMESTAMP}`)
  console.log(`Backup dir: ${BACKUP_DIR}\n`)
  const results = []
  for (const t of TABLES) {
    try {
      const r = await exportTable(t)
      results.push(r)
    } catch (err) {
      console.error(`FAILED ${t}:`, err.message)
      results.push({ name: t, error: err.message })
    }
  }

  console.log('\n=== BACKUP REPORT ===')
  for (const r of results) {
    if (r.skipped) console.log(`  ${r.name.padEnd(20)} | (table does not exist, skipped)`)
    else if (r.error) console.log(`  ${r.name.padEnd(20)} | ERROR: ${r.error}`)
    else console.log(`  ${r.name.padEnd(20)} | ${r.rows.toString().padStart(7)} rows | ${r.size.toString().padStart(12)} bytes | ${r.file}`)
  }
})().catch(e => { console.error(e); process.exit(1) })
