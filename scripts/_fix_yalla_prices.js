'use strict'
// Fix Yallamotor's price+year concatenation bug.
// Pattern: scraped price ends with the listing's year (last 4 digits).
// Real price = floor(stored / 10000) when (stored % 10000) == year.
// Unfixable cases get is_active=false.

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

;(async () => {
  // Find all listings with price_sar > 5,000,000 — these are virtually
  // guaranteed to be parse errors in our dataset (Saudi market top is
  // < 5M for any practical listing).
  const { data: bad } = await sb.from('listings')
    .select('id, source, source_id, source_url, price_sar, year, make_en, model_en, title')
    .gt('price_sar', 5_000_000)
    .order('price_sar', { ascending: false })
  console.log(`Found ${bad.length} listings with price > 5,000,000 SAR.`)
  console.log()

  let fixed = 0, deactivated = 0
  for (const l of bad) {
    let reasoning = ''
    let action = null

    if (l.year && (l.price_sar % 10000) === l.year) {
      const realPrice = Math.floor(l.price_sar / 10000)
      reasoning = `${l.price_sar} % 10000 == year(${l.year}); real price = ${realPrice}`
      // Sanity bound: real price should be in [1k, 5M]
      if (realPrice >= 1000 && realPrice <= 5_000_000) {
        action = { type: 'fix', new_price: realPrice }
      } else {
        action = { type: 'deactivate', reason: 'derived price out of bounds' }
      }
    } else {
      reasoning = `${l.price_sar} % 10000 = ${l.price_sar % 10000} (year=${l.year}); pattern doesn't match`
      action = { type: 'deactivate', reason: 'unfixable parse error' }
    }

    console.log(`  ${l.id.slice(0, 8)} | ${l.year} ${l.make_en}/${l.model_en} | ${l.price_sar.toLocaleString().padStart(15)} | ${action.type}`)
    console.log(`    ${reasoning}`)

    if (action.type === 'fix') {
      const { error } = await sb.from('listings').update({ price_sar: action.new_price }).eq('id', l.id)
      if (!error) fixed++
      else console.log(`    ERROR: ${error.message}`)
      // Also fix in raw_listings.structured_data so re-normalize doesn't regress.
      const { data: raw } = await sb.from('raw_listings').select('structured_data').eq('source', l.source).eq('source_id', l.source_id).maybeSingle()
      if (raw?.structured_data) {
        const sd = { ...raw.structured_data, price_sar: action.new_price }
        await sb.from('raw_listings').update({ structured_data: sd }).eq('source', l.source).eq('source_id', l.source_id)
      }
    } else if (action.type === 'deactivate') {
      const { error } = await sb.from('listings').update({ is_active: false }).eq('id', l.id)
      if (!error) deactivated++
    }
  }
  console.log()
  console.log(`fixed:        ${fixed}`)
  console.log(`deactivated:  ${deactivated}`)
})().catch(e => { console.error(e); process.exit(1) })
