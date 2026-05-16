'use strict'
// scripts/scrapers/saudisale.js — cars.saudisale.com (Tier 3)
//
// Two-phase: collect listing URLs from home/search page (click-load + scroll
// to exhaustion), then per-listing detail scrape. NO 300-listing cap from
// the legacy scraper — paginate until exhausted.

const { launchBrowser } = require('./_shared/playwright')
const { RawWriter }     = require('./_shared/raw-writer')

const argv = process.argv.slice(2)
const arg  = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
const flag = (n) => argv.includes(n)
const LIMIT       = arg('--limit') ? parseInt(arg('--limit'), 10) : null
const HEADED      = flag('--headed')
const INCREMENTAL = flag('--incremental')

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const log = (...a) => process.stderr.write(`[saudi] ${a.join(' ')}\n`)

function canonicalFuel (raw) {
  if (!raw) return null
  const s = String(raw).toLowerCase()
  if (s.includes('petrol') || s.includes('gas'))  return 'petrol'
  if (s.includes('diesel'))                        return 'diesel'
  if (s.includes('hybrid'))                        return 'hybrid'
  if (s.includes('electric'))                      return 'electric'
  return null
}
function canonicalTrans (raw) {
  if (!raw) return null
  const s = String(raw).toLowerCase()
  if (s.includes('auto')) return 'automatic'
  if (s.includes('manual')) return 'manual'
  return null
}
function canonicalBody (raw) {
  if (!raw) return null
  const s = String(raw).toLowerCase()
  if (s.includes('suv') || s.includes('crossover')) return 'suv'
  if (s.includes('pickup'))                          return 'pickup'
  if (s.includes('van'))                             return 'van'
  if (s.includes('coupe'))                           return 'coupe'
  if (s.includes('hatch'))                           return 'hatchback'
  if (s.includes('wagon'))                           return 'wagon'
  if (s.includes('sedan') || s.includes('saloon'))   return 'sedan'
  return null
}

async function collectListingUrls (ctx) {
  const page = await ctx.newPage()
  await page.goto('https://cars.saudisale.com/en', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await sleep(4500)
  const urls = new Set()
  let stale = 0
  const HARD = LIMIT ? LIMIT * 2 : 20000
  for (let i = 0; i < 200 && stale < 3; i++) {
    const links = await page.evaluate(() =>
      [...new Set([...document.querySelectorAll('a[href*="/listings/"]')]
        .map(a => a.href).filter(h => h.includes('/en/listings/')))]
    ).catch(() => [])
    const prev = urls.size
    for (const u of links) urls.add(u)
    if (urls.size >= HARD) break
    if (urls.size === prev) {
      const loadMore = await page.$('button:has-text("Load More"), button:has-text("عرض المزيد"), [wire\\:click*="load"]').catch(() => null)
      if (loadMore) await loadMore.click().catch(() => {})
      stale++
    } else { stale = 0 }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await sleep(2000)
  }
  await page.close()
  log(`collected ${urls.size} unique listing URLs`)
  return [...urls]
}

async function scrapeListingPage (ctx, url) {
  const page = await ctx.newPage()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await sleep(2800)
    const data = await page.evaluate(() => {
      const lines = (document.body.innerText || '').split('\n').map(l => l.trim()).filter(Boolean)
      function findVal (label) {
        for (let i = 0; i < lines.length; i++) {
          if (lines[i] === label && lines[i + 1]) return lines[i + 1]
        }
        return null
      }
      const imgs = [...document.querySelectorAll('img[src*="images-v1.saudisale.com"]')]
        .map(img => img.src.replace('/thumbnails/', '/').replace('thumbnails/', ''))
        .filter((v, i, a) => a.indexOf(v) === i)
        .slice(0, 12)
      let city = null
      const addr = lines.find(l => l.includes('Saudi Arabia'))
      if (addr) {
        const parts = addr.split(',').map(p => p.trim())
        if (parts[1]) city = parts[1]
      }
      let listingId = null
      const idLine = lines.find(l => l.match(/^\d{5,7}(\s+-\s+|$)/))
      if (idLine) listingId = idLine.match(/^(\d+)/)?.[1]
      const h1 = document.querySelector('h1')
      return {
        make: findVal('Car Maker'),
        carClass: findVal('Car Class'),
        model: findVal('Car Model'),
        year: findVal('Year'),
        gear: findVal('Gear Type'),
        mile: findVal('Mileage'),
        price: findVal('Price'),
        fuel: findVal('Fuel Type'),
        body: findVal('Car Type'),
        color: findVal('Body color'),
        seats: findVal('Seats') || findVal('Seating Capacity'),
        doors: findVal('Doors') || findVal('Number of Doors'),
        city, listingId, imgs,
        title: h1?.innerText?.trim() ?? null,
      }
    }).catch(() => null)
    if (!data) return null
    const make = data.make
    const model = data.carClass || data.model
    if (!make || !model) return null
    const price = data.price ? parseInt(data.price.replace(/[,\s]/g, '')) : null
    if (!price || price <= 0) return null
    const year = data.year ? parseInt(data.year) : null
    const mileage = data.mile ? parseInt(data.mile.replace(/[,\s]/g, '')) : null
    const trim = data.model !== data.carClass ? data.model : null
    const hashMatch = url.match(/\/listings\/([^/]+)\//)
    const sourceId = data.listingId || hashMatch?.[1] || null
    if (!sourceId) return null
    return {
      source_id: sourceId,
      source_url: url,
      structured_data: {
        source_id: sourceId,
        source_url: url,
        title: data.title || `${make} ${model} ${year ?? ''}`.trim(),
        make_en: make, make_ar: null,
        model_en: model, model_ar: null,
        trim,
        year,
        condition: 'used',
        price_sar: price,
        mileage_km: mileage && mileage > 0 ? mileage : null,
        city_en: data.city, city_ar: null,
        color_en: data.color, color_ar: null,
        fuel_type: canonicalFuel(data.fuel),
        transmission: canonicalTrans(data.gear),
        body_type: canonicalBody(data.body),
        drive_type: null,
        engine_size_l: null,
        doors: data.doors ? parseInt(data.doors) : null,
        seats: data.seats ? parseInt(data.seats) : null,
        seller_type: 'private',
        photos: data.imgs || [],
        description_ar: null,
      },
    }
  } catch (e) {
    return null
  } finally {
    await page.close()
  }
}

;(async () => {
  log(`start (${LIMIT ? `limit=${LIMIT}` : 'full'})`)
  const t0 = Date.now()
  const writer = new RawWriter({ source: 'saudisale' })

  let skipSet = new Set()
  if (INCREMENTAL) {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const { data } = await writer.sb.from('raw_listings').select('source_id').eq('source', 'saudisale').gte('scraped_at', since)
    skipSet = new Set((data ?? []).map(r => r.source_id))
    log(`incremental: ${skipSet.size} recent rows skipped`)
  }

  const { browser } = await launchBrowser({ headless: !HEADED })
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US', ignoreHTTPSErrors: true,
  })
  const urls = await collectListingUrls(ctx)

  let successes = 0
  const CONC = 3
  for (let i = 0; i < urls.length; i += CONC) {
    if (LIMIT && successes >= LIMIT) break
    const batch = urls.slice(i, i + CONC)
    const results = await Promise.all(batch.map(u => scrapeListingPage(ctx, u)))
    for (const r of results) {
      if (!r) continue
      if (skipSet.has(r.source_id)) continue
      await writer.add(r)
      successes++
    }
    if (successes % 25 === 0 && successes > 0) log(`  scraped ${successes}/${urls.length}`)
    await sleep(900)
  }

  await ctx.close()
  await writer.close()
  await browser.close()
  log(`done — ${successes}/${urls.length} in ${((Date.now()-t0)/1000).toFixed(1)}s`)
  log(`raw_writer totals: ${JSON.stringify(writer.totals)}`)
})().catch(e => { console.error(e); process.exit(1) })
