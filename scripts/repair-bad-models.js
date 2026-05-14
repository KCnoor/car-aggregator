'use strict'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const fs   = require('fs')
const path = require('path')

// Load env (only set if not already in shell)
const envPath = path.join(__dirname, '..', '.env.local')
try {
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
    }
  }
} catch { /* env vars supplied via shell */ }

const { createClient } = require('@supabase/supabase-js')
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

;(async () => {
  // Fix 1: Haval Jolion Pro — was misidentified as nissan-datsun-go-plus
  const fix1 = await sb
    .from('listings')
    .update({
      model_slug: 'jolion-pro',
      model_en:   'Jolion Pro',
      model_ar:   'جوليون برو',
    })
    .eq('model_slug', 'nissan-datsun-go-plus')

  console.log(`Fix1 (nissan-datsun-go-plus → jolion-pro): error=${fix1.error?.message ?? 'none'}, count=${fix1.count ?? 'n/a'}`)

  // Fix 2: MG 3 — was misidentified as mazda-3
  const fix2 = await sb
    .from('listings')
    .update({
      model_slug: 'mg-3',
      model_en:   'MG 3',
      model_ar:   'ام جي 3',
    })
    .eq('model_slug', 'mazda-3')
    .eq('make_slug',  'mg')

  console.log(`Fix2 (mg+mazda-3 → mg-3): error=${fix2.error?.message ?? 'none'}, count=${fix2.count ?? 'n/a'}`)

  // Fix 3: Haval Jolion (base) — was "julian"
  const fix3 = await sb
    .from('listings')
    .update({
      model_slug: 'jolion',
      model_en:   'Jolion',
      model_ar:   'جوليون',
    })
    .eq('model_slug', 'julian')
    .eq('make_slug',  'haval')

  console.log(`Fix3 (haval+julian → jolion): error=${fix3.error?.message ?? 'none'}, count=${fix3.count ?? 'n/a'}`)

  // Verify — show all haval and mg listings after fix
  const { data, error } = await sb
    .from('listings')
    .select('id, make_slug, model_slug, model_en, year, price_sar')
    .in('make_slug', ['haval', 'mg'])
    .order('make_slug')
    .order('model_slug')

  if (error) { console.error('Verify error:', error.message); process.exit(1) }
  console.log('\n=== Haval + MG listings after repair ===')
  for (const r of data) {
    console.log(`  ${r.make_slug} / ${r.model_slug} (${r.model_en}) — ${r.year} — ${r.price_sar ?? 'no price'}`)
  }
  console.log(`\nTotal: ${data.length}`)
})()
