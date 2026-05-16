'use strict'
// Apply strict quality gate to Haraj listings.
// Set is_active=false for any Haraj listing that fails ANY of:
//   - price_sar > 5,000
//   - mileage_km present AND mileage_per_year in [5,000, 50,000]
//   - make_slug AND model_slug populated
//   - year in [2000, 2027]
//   - description does NOT contain wreck patterns
//   - description length > 30
//
// Report survivors + 5 random spot-checks.

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

const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const WRECK_PATTERNS = [
  /حادث|مصدوم|تصادم/i,
  /airbag(s)?\s*deployed|airbag|air\s*bag/i,
  /side\s*impact(s)?|اصطدام\s*جانبي/i,
  /محرك\s*معاد|محرك\s*مجدد|engine\s*overhauled?|overhauled/i,
  /استمارة\s*منتهية?|expired\s*registration/i,
  /وفاة|توفي|متوفي|ورث|ميراث|inheritance|deceased/i,
  /\bdamage(d|s)?\b|تالف|متضرر/i,
  /salvage|شطب/i,
  /fender\s*repair|إصلاح\s*رفرف/i,
]

function failsHarajGate (l) {
  const reasons = []
  if (!l.price_sar || l.price_sar <= 5000) reasons.push('price<=5000')
  if (l.mileage_km == null) reasons.push('mileage_km null')
  else {
    const age = Math.max(1, 2026 - (l.year ?? 2026))
    const mpy = l.mileage_km / age
    if (mpy < 5000 || mpy > 50000) reasons.push(`mileage_per_year=${Math.round(mpy)} out of [5000,50000]`)
  }
  if (!l.make_slug)  reasons.push('no make_slug')
  if (!l.model_slug) reasons.push('no model_slug')
  if (l.year == null || l.year < 2000 || l.year > 2027) reasons.push(`year=${l.year}`)
  const desc = l.description_ar ?? ''
  if (desc.length <= 30) reasons.push('desc<=30 chars')
  for (const re of WRECK_PATTERNS) if (re.test(desc)) { reasons.push(`wreck pattern: ${re.source.slice(0, 30)}`); break }
  return reasons
}

;(async () => {
  console.log('Loading Haraj listings…')
  const { data: haraj, error } = await sb.from('listings')
    .select('id, source_url, source_id, make_slug, model_slug, make_en, model_en, year, price_sar, mileage_km, description_ar, title, is_active, deal_score_v2')
    .eq('source', 'haraj')
  if (error) throw error
  console.log(`  ${haraj.length} Haraj listings`)

  const survivors = []
  const failed = []
  for (const l of haraj) {
    const reasons = failsHarajGate(l)
    if (reasons.length === 0) survivors.push(l)
    else failed.push({ ...l, _reasons: reasons })
  }
  console.log(`\nSurvivors: ${survivors.length} / ${haraj.length} (${((survivors.length / haraj.length) * 100).toFixed(1)}%)`)
  console.log(`Failed:    ${failed.length}`)

  // Reason histogram
  const reasonCounts = {}
  for (const f of failed) {
    for (const r of f._reasons) reasonCounts[r.split('=')[0].split(' out')[0]] = (reasonCounts[r.split('=')[0].split(' out')[0]] ?? 0) + 1
  }
  console.log('\nFail reason histogram:')
  for (const [r, c] of Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${r.padEnd(30)} ${c}`)
  }

  // Update DB: set is_active=false for failed
  console.log(`\nDeactivating ${failed.length} failed listings…`)
  let deactivated = 0
  for (let i = 0; i < failed.length; i += 20) {
    const batch = failed.slice(i, i + 20)
    await Promise.all(batch.map(async (l) => {
      const { error: e } = await sb.from('listings').update({ is_active: false }).eq('id', l.id)
      if (!e) deactivated++
    }))
  }
  console.log(`  deactivated: ${deactivated}`)

  // Spot-check 5 random survivors
  const sample = survivors.sort(() => Math.random() - 0.5).slice(0, 5)
  console.log('\n══ 5 random survivor spot-checks ══')
  for (const s of sample) {
    console.log()
    console.log('source_url:', s.source_url)
    console.log('id:', s.id.slice(0, 8))
    console.log('year/make/model:', s.year, s.make_en ?? s.make_slug, s.model_en ?? s.model_slug)
    console.log('price:', s.price_sar?.toLocaleString(), 'mileage:', s.mileage_km?.toLocaleString())
    console.log('mpy:', Math.round((s.mileage_km ?? 0) / Math.max(1, 2026 - (s.year ?? 2026))))
    console.log('score_v2:', s.deal_score_v2)
    console.log('desc:', (s.description_ar ?? '').slice(0, 200))
  }
})().catch(e => { console.error(e); process.exit(1) })
