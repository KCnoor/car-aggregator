'use strict'
// scripts/scrapers/digitalcar.js — digitalcar.sa (Tier 1, expected 1k–2k)
// Strategy: discover listing URLs from category/search pages; per detail page,
// parse JSON-LD if present, else HTML scrape. Treated as Tier 1 (managed
// marketplace).

const { launchBrowser } = require('./_shared/playwright')
const { RawWriter }     = require('./_shared/raw-writer')

const argv = process.argv.slice(2)
const arg  = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
const flag = (n) => argv.includes(n)
const LIMIT       = arg('--limit') ? parseInt(arg('--limit'), 10) : null
const HEADED      = flag('--headed')
const INCREMENTAL = flag('--incremental')

const PAGE_TIMEOUT = 35000
const MIN_DELAY = 2000
const MAX_DELAY = 4000
const MAX_PAGES = 300

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const rndDelay = () => sleep(MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY))
const log = (...a) => process.stderr.write(`[digitalcar] ${a.join(' ')}\n`)

const HUBS = [
  'https://digitalcar.sa/en/cars',
  'https://digitalcar.sa/en/used-cars',
  'https://digitalcar.sa/cars',
  'https://digitalcar.sa/',
]

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
  if (s.includes('auto') || s.includes('cvt')) return 'automatic'
  if (s.includes('manual'))                    return 'manual'
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

async function collectUrls (browser) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US', ignoreHTTPSErrors: true,
  })
  const page = await ctx.newPage()
  const urls = new Map()

  // Try each hub URL; whichever serves the listing index will populate urls.
  for (const hub of HUBS) {
    try {
      await page.goto(hub, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT })
      await sleep(4000)
      const hrefs = await page.evaluate(() =>
        [...new Set([...document.querySelectorAll('a[href]')].map(a => a.href)
          .filter(h => /digitalcar\.sa.*\/(car|listing|vehicle|product|detail)\b/i.test(h)))]
      )
      if (hrefs.length === 0) continue
      log(`hub ${hub.replace('https://', '')} → ${hrefs.length} candidate URLs`)
      // Paginate this hub if it has a ?page= pattern.
      for (let pg = 1; pg <= MAX_PAGES; pg++) {
        if (LIMIT && urls.size >= LIMIT * 2) break
        const pageUrl = pg === 1 ? hub : `${hub}?page=${pg}`
        try {
          await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT })
          await sleep(2500)
          const items = await page.evaluate(() =>
            [...new Set([...document.querySelectorAll('a[href]')].map(a => a.href)
              .filter(h => /digitalcar\.sa.*\/(car|listing|vehicle|product|detail)\b/i.test(h)))]
          )
          const prev = urls.size
          for (const u of items) {
            const id = u.split('/').filter(Boolean).pop()?.split('?')[0]
            if (id && !urls.has(id)) urls.set(id, u.split('?')[0])
          }
          const added = urls.size - prev
          log(`  page ${pg}: +${added} new (total ${urls.size})`)
          if (added === 0 && pg > 1) break
        } catch (e) {
          log(`  page ${pg} error: ${e.message?.slice(0, 60)}`)
          break
        }
        await rndDelay()
      }
      break    // first hub that worked
    } catch (e) {
      log(`hub ${hub} unreachable: ${e.message?.slice(0, 60)}`)
    }
  }
  await ctx.close()
  return [...urls.entries()].map(([id, url]) => ({ id, url }))
}

async function extractListing (page, url, id) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT })
    await sleep(2500)
  } catch { return null }
  const data = await page.evaluate(() => {
    // JSON-LD first
    const ldObjects = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map(s => { try { return JSON.parse(s.textContent) } catch { return null } })
      .filter(Boolean)
    const carLd = ldObjects.find(o => /Car|Vehicle|Product/i.test(o['@type'] ?? '')) ?? null
    const text = document.body?.innerText ?? ''
    function val (labels) {
      for (const lbl of labels) {
        const re = new RegExp(`\\b${lbl}\\b\\s*[:\\n]\\s*([^\\n]+)`, 'i')
        const m = text.match(re)
        if (m) return m[1].trim()
      }
      return null
    }
    const priceMatch = text.match(/(?:SAR|ر\.س)\s*([\d,]+)/i)
    const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : null
    const title = document.querySelector('h1')?.textContent?.trim() ?? null
    const photos = [...new Set([...document.querySelectorAll('img[src]')].map(i => i.src)
      .filter(s => /digitalcar|cdn|cloudfront|amazonaws/i.test(s)))].slice(0, 20)
    return {
      carLd, title, price, photos,
      year:        parseInt(val(['Year', 'Manufacturing Year'])) || null,
      mileageRaw:  val(['Mileage', 'Kilometers']),
      makeRaw:     val(['Make', 'Brand']),
      modelRaw:    val(['Model']),
      trimRaw:     val(['Trim', 'Variant']),
      bodyRaw:     val(['Body Type', 'Body']),
      fuelRaw:     val(['Fuel Type', 'Fuel']),
      transRaw:    val(['Transmission', 'Gearbox']),
      colorRaw:    val(['Color', 'Exterior Color']),
      cityRaw:     val(['City', 'Location']),
      seatsRaw:    val(['Seats']),
      doorsRaw:    val(['Doors']),
    }
  }).catch(() => null)
  if (!data) return null

  // Prefer JSON-LD where present.
  const ld = data.carLd
  const make = ld?.brand?.name ?? (typeof ld?.brand === 'string' ? ld.brand : null) ?? data.makeRaw
  const model = (typeof ld?.model === 'string' ? ld.model : ld?.model?.name) ?? data.modelRaw
  const price = parseInt(ld?.offers?.price) || data.price || null
  if (!price || !make || !model) return null
  const year = ld?.vehicleModelDate ? parseInt(ld.vehicleModelDate) : data.year
  const mileage = ld?.mileageFromOdometer?.value ? Math.round(parseFloat(ld.mileageFromOdometer.value))
    : (data.mileageRaw ? parseInt(data.mileageRaw.replace(/[^0-9]/g, '')) || null : null)
  const photos = (Array.isArray(ld?.image) ? ld.image : (ld?.image ? [ld.image] : null)) ?? data.photos
  return {
    source_id: id,
    source_url: url,
    structured_data: {
      source_id: id,
      source_url: url,
      title: data.title || ld?.name,
      make_en: make, make_ar: null,
      model_en: model, model_ar: null,
      trim: data.trimRaw ?? ld?.vehicleConfiguration ?? null,
      year,
      condition: 'used',
      price_sar: price,
      mileage_km: mileage && mileage > 0 ? mileage : null,
      city_en: data.cityRaw, city_ar: null,
      color_en: ld?.color ?? data.colorRaw, color_ar: null,
      fuel_type: canonicalFuel(ld?.vehicleEngine?.fuelType ?? data.fuelRaw),
      transmission: canonicalTrans(ld?.vehicleTransmission ?? data.transRaw),
      body_type: canonicalBody(ld?.bodyType ?? data.bodyRaw),
      drive_type: null,
      engine_size_l: null,
      doors: data.doorsRaw ? parseInt(data.doorsRaw) || null : null,
      seats: data.seatsRaw ? parseInt(data.seatsRaw) || null : null,
      seller_type: 'dealer',
      photos,
      description_ar: ld?.description ?? null,
    },
  }
}

;(async () => {
  log(`start (${LIMIT ? `limit=${LIMIT}` : 'full'})`)
  const t0 = Date.now()
  const writer = new RawWriter({ source: 'digitalcar' })

  let skipSet = new Set()
  if (INCREMENTAL) {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const { data } = await writer.sb.from('raw_listings').select('source_id').eq('source', 'digitalcar').gte('scraped_at', since)
    skipSet = new Set((data ?? []).map(r => r.source_id))
    log(`incremental: ${skipSet.size} recent rows skipped`)
  }

  const { browser } = await launchBrowser({ headless: !HEADED })
  const urls = await collectUrls(browser)
  log(`Phase 1 done — ${urls.length} listing URLs`)

  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US', ignoreHTTPSErrors: true,
  })
  const page = await ctx.newPage()

  let successes = 0
  for (const { id, url } of urls) {
    if (LIMIT && successes >= LIMIT) break
    if (skipSet.has(id)) continue
    const r = await extractListing(page, url, id)
    if (r) {
      await writer.add(r)
      successes++
      if (successes % 25 === 0) log(`  scraped ${successes}/${urls.length}`)
    }
    await rndDelay()
  }

  await ctx.close()
  await writer.close()
  await browser.close()
  log(`done — ${successes}/${urls.length} in ${((Date.now()-t0)/1000).toFixed(1)}s`)
  log(`raw_writer totals: ${JSON.stringify(writer.totals)}`)
})().catch(e => { console.error(e); process.exit(1) })
