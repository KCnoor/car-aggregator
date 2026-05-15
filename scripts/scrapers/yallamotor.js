'use strict'
// scripts/scrapers/yallamotor.js — ksa.yallamotor.com/used-cars (Tier 2)
// Listing cards are parsed directly off the search-result pages (no per-detail
// fetch needed; all fields fit on the card). No hard page cap — paginate
// until a page returns no new IDs.

const { launchBrowser } = require('./_shared/playwright')
const { RawWriter }     = require('./_shared/raw-writer')

const argv = process.argv.slice(2)
const arg  = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
const flag = (n) => argv.includes(n)
const LIMIT       = arg('--limit') ? parseInt(arg('--limit'), 10) : null
const HEADED      = flag('--headed')
const INCREMENTAL = flag('--incremental')

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const log = (...a) => process.stderr.write(`[yalla] ${a.join(' ')}\n`)
const MAX_PAGES = 200

;(async () => {
  log(`start (${LIMIT ? `limit=${LIMIT}` : 'full'})`)
  const t0 = Date.now()
  const writer = new RawWriter({ source: 'yallamotor' })

  let skipSet = new Set()
  if (INCREMENTAL) {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const { data } = await writer.sb.from('raw_listings').select('source_id').eq('source', 'yallamotor').gte('scraped_at', since)
    skipSet = new Set((data ?? []).map(r => r.source_id))
    log(`incremental: ${skipSet.size} recent rows skipped`)
  }

  const { browser } = await launchBrowser({ headless: !HEADED })
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US', ignoreHTTPSErrors: true,
  })

  let successes = 0
  let consecutiveEmpty = 0
  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    if (LIMIT && successes >= LIMIT) break
    if (consecutiveEmpty >= 2) { log('two consecutive empty pages, stopping'); break }
    const page = await ctx.newPage()
    const url  = `https://ksa.yallamotor.com/used-cars?page=${pageNum}`
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await sleep(4500)
      const listings = await page.evaluate(() => {
        const out = []
        for (const art of document.querySelectorAll('article')) {
          const link = art.querySelector('a[href*="/used-cars/"]')
          if (!link) continue
          const href = link.href || ''
          const m = href.match(/\/used-cars\/([^/]+)\/([^/]+)\/(\d{4})\/[^?]+-(\d+)(?:\?|$)/)
          if (!m) continue
          const make = m[1].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
          const model = m[2].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
          const year = parseInt(m[3]); const id = m[4]
          const ariaLabel = link.getAttribute('aria-label') || ''
          const title = ariaLabel.replace(/^View details for\s*/i, '').trim() || `${make} ${model} ${year}`
          const tc = art.textContent || ''
          const priceMatch = tc.match(/SAR\s*([\d,]+)/)
          const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : null
          const mileMatch = tc.match(/([\d,]+)\s*KM/i)
          const mileage = mileMatch ? parseInt(mileMatch[1].replace(/,/g, '')) : null
          const fuelMatch  = tc.match(/Fuel\s*type\s*(Petrol|Diesel|Hybrid|Electric)/i)
          const transMatch = tc.match(/Transmission\s*(Automatic|Manual)/i)
          const bodyMatch  = tc.match(/Body\s*Type\s*(Sedan|SUV|Coupe|Hatchback|Pickup|Van|Wagon)/i)
          const saudiCities = ['Riyadh','Jeddah','Dammam','Makkah','Madinah','Khobar','Tabuk','Taif','Abha','Jubail','Yanbu','Qassim','Hail','Jizan','Najran','Hofuf']
          let city = null
          for (const c of saudiCities) if (tc.toLowerCase().includes(c.toLowerCase())) { city = c; break }
          let imgSrc = null
          const img = art.querySelector('img[src*="ymimg1"], img[srcset*="ymimg1"]')
          if (img) {
            const src = img.getAttribute('srcset') || img.src || ''
            const enc = src.match(/url=(https?%3A%2F%2Fymimg1[^&\s]+)/)
            if (enc) { try { imgSrc = decodeURIComponent(enc[1]) } catch {} }
            if (!imgSrc) { const d = src.match(/(https?:\/\/ymimg1[^\s,]+)/); if (d) imgSrc = d[1] }
          }
          if (!price || price <= 0) continue
          out.push({ id, make, model, year, title, price, mileage, fuel: fuelMatch?.[1] ?? null, transmission: transMatch?.[1] ?? null, body_type: bodyMatch?.[1] ?? null, city, imgSrc, url: href.split('?')[0] })
        }
        return out
      })

      let added = 0
      for (const l of listings) {
        if (skipSet.has(l.id)) continue
        await writer.add({
          source_id: l.id,
          source_url: l.url,
          structured_data: {
            source_id: l.id,
            source_url: l.url,
            title: l.title,
            make_en: l.make, make_ar: null,
            model_en: l.model, model_ar: null,
            trim: null,
            year: l.year,
            condition: 'used',
            price_sar: l.price,
            mileage_km: l.mileage,
            city_en: l.city, city_ar: null,
            color_en: null, color_ar: null,
            fuel_type: l.fuel?.toLowerCase() ?? null,
            transmission: l.transmission?.toLowerCase() ?? null,
            body_type: l.body_type?.toLowerCase() ?? null,
            drive_type: null,
            engine_size_l: null,
            doors: null,
            seats: null,
            seller_type: 'dealer',
            photos: l.imgSrc ? [l.imgSrc] : [],
            description_ar: null,
          },
        })
        successes++; added++
      }
      log(`page ${pageNum}: ${listings.length} cards, +${added} new (total ${successes})`)
      if (added === 0) consecutiveEmpty++; else consecutiveEmpty = 0
    } catch (e) {
      log(`page ${pageNum} error: ${e.message?.slice(0, 80)}`)
    } finally {
      await page.close()
    }
    await sleep(1500)
  }

  await writer.close()
  await browser.close()
  log(`done — ${successes} success in ${((Date.now()-t0)/1000).toFixed(1)}s`)
  log(`raw_writer totals: ${JSON.stringify(writer.totals)}`)
})().catch(e => { console.error(e); process.exit(1) })
