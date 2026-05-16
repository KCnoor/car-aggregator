'use strict'
// One-shot: backfill photo_urls for existing CarSwitch listings using
// Playwright + stealth (bare-fetch gets Cloudflare-challenged after ~30 reqs).
// Reads JSON-LD `"image":[...]` directly from page HTML — no rendering needed
// past initial load.

const fs = require('fs')
for (const line of fs.readFileSync('/Users/kaisinoureddin/car-aggregator/.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.replace(/^export\s+/, '').trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
}
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const { createClient } = require('/Users/kaisinoureddin/car-aggregator/node_modules/@supabase/supabase-js')
const { launchBrowser } = require('/Users/kaisinoureddin/car-aggregator/scripts/scrapers/_shared/playwright.js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  const { data, error } = await sb.from('listings')
    .select('id, source_url, photo_urls')
    .eq('source', 'carswitch')
    .eq('is_active', true)
    .is('photo_urls', null)
  if (error) throw error
  console.log(`Backfilling ${data.length} CarSwitch listings via Playwright…`)

  const { browser, context, hasStealth } = await launchBrowser({})
  console.log('Stealth:', hasStealth ? 'yes' : 'no')
  const page = await context.newPage()

  let updated = 0, withPhotos = 0, failed = 0
  for (let i = 0; i < data.length; i++) {
    const row = data[i]
    try {
      const res = await page.goto(row.source_url, { waitUntil: 'domcontentloaded', timeout: 25000 })
      if (!res || !res.ok()) throw new Error(`HTTP ${res ? res.status() : 'no-response'}`)
      // Extract JSON-LD `image` array.
      const photos = await page.evaluate(() => {
        const out = []
        const seen = new Set()
        for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
          try {
            const j = JSON.parse(s.textContent || '')
            const imgs = Array.isArray(j.image) ? j.image
                        : (typeof j.image === 'string' ? [j.image] : [])
            for (const u of imgs) {
              if (typeof u !== 'string' || seen.has(u)) continue
              seen.add(u); out.push(u)
              if (out.length >= 20) return out
            }
          } catch { /* skip */ }
        }
        return out
      })
      if (photos.length > 0) withPhotos++
      const { error: e } = await sb.from('listings')
        .update({ photo_urls: photos.length ? photos : null })
        .eq('id', row.id)
      if (!e) updated++
      if (i % 25 === 0) console.log(`  [${i + 1}/${data.length}] updated=${updated} with_photos=${withPhotos} failed=${failed}`)
    } catch (e) {
      failed++
      if (failed <= 5) console.error(`  fail ${row.source_url}: ${e.message}`)
    }
    await sleep(1500 + Math.random() * 1000)
  }
  await browser.close()
  console.log(`\nDone. updated=${updated}/${data.length} with_photos=${withPhotos} failed=${failed}`)
})().catch(e => { console.error(e); process.exit(1) })
