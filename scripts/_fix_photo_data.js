'use strict'
// One-shot:
//  1) DigitalCar — re-fetch each listing's HTML, extract real S3 car photos
//     from dcar-prod.s3.amazonaws.com/imgUploads/<ts>.webp, write to DB.
//  2) Dubizzle — wipe garbage photo_urls (we stored UI sprite SVGs); set to
//     NULL so the styled placeholder kicks in. Real Dubizzle photos are
//     JS-rendered and out of scope for this pass.

const fs = require('fs')
for (const line of fs.readFileSync('/Users/kaisinoureddin/car-aggregator/.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.replace(/^export\s+/, '').trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
}
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const { createClient } = require('/Users/kaisinoureddin/car-aggregator/node_modules/@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const sleep = ms => new Promise(r => setTimeout(r, ms))

function extractDigitalCarPhotos (html) {
  const seen = new Set()
  const out = []
  const re = /https?:\/\/[^"'\\<> ]*dcar-prod\.s3\.amazonaws\.com\/imgUploads\/[^"'\\<> ?&]+\.(?:jpe?g|png|webp)/gi
  let m
  while ((m = re.exec(html)) !== null) {
    if (seen.has(m[0])) continue
    seen.add(m[0])
    out.push(m[0])
    if (out.length >= 20) break
  }
  return out
}

;(async () => {
  // ── Dubizzle wipe ────────────────────────────────────────────────────────
  console.log('── Dubizzle: wiping garbage photo_urls ──')
  const { count: dzTotal } = await sb.from('listings').select('*', { count: 'exact', head: true })
    .eq('source', 'dubizzle').eq('is_active', true)
  const { error: dzErr } = await sb.from('listings')
    .update({ photo_urls: null })
    .eq('source', 'dubizzle')
    .eq('is_active', true)
  if (dzErr) throw dzErr
  console.log(`Dubizzle: wiped photo_urls on ${dzTotal} active listings → placeholder will render`)

  // ── DigitalCar refetch ───────────────────────────────────────────────────
  console.log('\n── DigitalCar: refetching real photos ──')
  const { data: dcRows, error: dcErr } = await sb.from('listings')
    .select('id, source_url')
    .eq('source', 'digitalcar')
    .eq('is_active', true)
  if (dcErr) throw dcErr
  console.log(`Processing ${dcRows.length} DigitalCar listings…`)

  let updated = 0, withPhotos = 0, failed = 0
  for (let i = 0; i < dcRows.length; i++) {
    const row = dcRows[i]
    try {
      const res = await fetch(row.source_url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const html = await res.text()
      const photos = extractDigitalCarPhotos(html)
      if (photos.length > 0) withPhotos++
      const { error: e } = await sb.from('listings')
        .update({ photo_urls: photos.length ? photos : null })
        .eq('id', row.id)
      if (!e) updated++
    } catch (e) {
      failed++
      if (failed <= 5) console.error(`  fail ${row.source_url}: ${e.message}`)
    }
    if (i % 20 === 0 || i === dcRows.length - 1) {
      console.log(`  [${i + 1}/${dcRows.length}] updated=${updated} with_photos=${withPhotos} failed=${failed}`)
    }
    await sleep(600 + Math.random() * 400)
  }
  console.log(`\nDigitalCar done. updated=${updated}/${dcRows.length} with_photos=${withPhotos} failed=${failed}`)
})().catch(e => { console.error(e); process.exit(1) })
