'use strict'
// One-shot status snapshot for the scraping cohort. Designed to be called
// from a background "sleep 1800 && node _status_check.js" timer.

const fs = require('fs'), path = require('path')

try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.replace(/^export\s+/, '').trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
    }
  }
} catch {}

const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const SOURCES = ['syarah','motory','soum','yallamotor','gogomotor','saudisale','carswitch','digitalcar','dubizzle']
const LOG_FILES = {
  syarah:     'logs/syarah-full-v2.log',
  motory:     'logs/motory-full.log',
  soum:       'logs/soum-full-v2.log',
  yallamotor: 'logs/yallamotor-v2.log',
  gogomotor:  'logs/gogomotor-full.log',
  saudisale:  'logs/saudisale-full.log',
  carswitch:  'logs/carswitch-v2.log',
  digitalcar: 'logs/digitalcar-v2.log',
  dubizzle:   'logs/dubizzle-full.log',
}

;(async () => {
  console.log('=== STATUS', new Date().toISOString().slice(0, 19), '===')

  let total = 0
  console.log('\nraw_listings by source:')
  for (const src of SOURCES) {
    const { count } = await sb.from('raw_listings').select('*', { count: 'exact', head: true }).eq('source', src)
    console.log(`  ${src.padEnd(12)} ${String(count).padStart(6)}`)
    total += count
  }
  console.log(`  ${'TOTAL'.padEnd(12)} ${String(total).padStart(6)}`)

  console.log('\nactive scrapers:')
  const { execSync } = require('child_process')
  try {
    const ps = execSync('pgrep -lf "scripts/scrapers/" 2>/dev/null || true', { encoding: 'utf8' })
    const lines = ps.split('\n').filter(l => l.includes('node scripts/scrapers/'))
    for (const l of lines) console.log('  ', l.replace(/.* node /, 'node '))
    if (!lines.length) console.log('  (none)')
  } catch {}

  console.log('\nlatest log tails:')
  for (const src of SOURCES) {
    const lf = path.join(__dirname, '..', LOG_FILES[src])
    if (!fs.existsSync(lf)) continue
    const lines = fs.readFileSync(lf, 'utf8').trim().split('\n')
    const tail = lines.slice(-2).join('\n    ')
    console.log(`  [${src}] ${tail}`)
  }
})().catch(e => console.error('status error:', e.message))
