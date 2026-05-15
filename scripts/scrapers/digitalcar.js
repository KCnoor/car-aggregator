'use strict'
// scripts/scrapers/digitalcar.js — digitalcar.sa (Tier 1)
//
// DigitalCar lists primarily NEW cars from dealers. Listing detail URLs use
// MongoDB-style ids: /en/prod_det/{24-hex-id}/{arabic-slug}.
//
// Phase 1: paginate /en/products?page=N until pages return empty.
// Phase 2: per-listing extraction. Many fields rendered in Arabic only;
//          shape mirrors Motory (we set make_ar/model_ar and let Layer 2
//          resolve via translations.json).

const { launchBrowser } = require('./_shared/playwright')
const { RawWriter }     = require('./_shared/raw-writer')

const argv = process.argv.slice(2)
const arg  = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
const flag = (n) => argv.includes(n)
const LIMIT       = arg('--limit') ? parseInt(arg('--limit'), 10) : null
const HEADED      = flag('--headed')
const INCREMENTAL = flag('--incremental')

const PAGE_TIMEOUT = 30000
const MIN_DELAY = 2500
const MAX_DELAY = 4500
const MAX_PAGES = 100

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const rndDelay = () => sleep(MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY))
const log = (...a) => process.stderr.write(`[digitalcar] ${a.join(' ')}\n`)

const PRODUCT_ID_RE = /\/prod_det\/([0-9a-f]{20,})\//

function canonicalFuel (raw) {
  if (!raw) return null
  const s = String(raw).toLowerCase()
  if (s.includes('petrol') || s.includes('gas') || s.includes('بنزين')) return 'petrol'
  if (s.includes('diesel') || s.includes('ديزل')) return 'diesel'
  if (s.includes('hybrid') || s.includes('هجين'))  return 'hybrid'
  if (s.includes('electric') || s.includes('كهرب')) return 'electric'
  return null
}
function canonicalTrans (raw) {
  if (!raw) return null
  const s = String(raw).toLowerCase()
  if (s.includes('auto') || s.includes('cvt') || s.includes('اوتو')) return 'automatic'
  if (s.includes('manual') || s.includes('يدوي'))                    return 'manual'
  return null
}
function canonicalBody (raw) {
  if (!raw) return null
  const s = String(raw).toLowerCase()
  if (s.includes('suv') || s.includes('crossover')) return 'suv'
  if (s.includes('pickup') || s.includes('بيك')) return 'pickup'
  if (s.includes('van')) return 'van'
  if (s.includes('coupe')) return 'coupe'
  if (s.includes('hatch') || s.includes('هاتش')) return 'hatchback'
  if (s.includes('wagon')) return 'wagon'
  if (s.includes('sedan') || s.includes('سيدان')) return 'sedan'
  return null
}

async function collectUrls (browser) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US', ignoreHTTPSErrors: true,
  })
  const page = await ctx.newPage()
  const urls = new Map()
  let consecutiveEmpty = 0
  for (let pg = 1; pg <= MAX_PAGES && consecutiveEmpty < 2; pg++) {
    if (LIMIT && urls.size >= LIMIT * 2) break
    const url = pg === 1 ? 'https://digitalcar.sa/en/products' : `https://digitalcar.sa/en/products?page=${pg}`
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT })
      await sleep(4500)
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {})
      await sleep(2000)
      const items = await page.evaluate(() =>
        [...new Set([...document.querySelectorAll('a[href*="/prod_det/"]')].map(a => a.href))]
      )
      const before = urls.size
      for (const u of items) {
        const m = u.match(PRODUCT_ID_RE)
        if (!m) continue
        if (!urls.has(m[1])) urls.set(m[1], u.split('?')[0])
      }
      const added = urls.size - before
      log(`page ${pg}: +${added} (total ${urls.size})`)
      if (added === 0) consecutiveEmpty++; else consecutiveEmpty = 0
    } catch (e) {
      log(`page ${pg} err: ${e.message?.slice(0, 80)}`)
      consecutiveEmpty++
    }
    await rndDelay()
  }
  await ctx.close()
  return [...urls.entries()].map(([id, url]) => ({ id, url }))
}

async function extractListing (page, url, id) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT })
    await sleep(4000)
  } catch { return null }

  const data = await page.evaluate(() => {
    const ldObjects = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map(s => { try { return JSON.parse(s.textContent) } catch { return null } })
      .filter(Boolean)
    const carLd = ldObjects.find(o => /Car|Vehicle|Product/i.test(o['@type'] ?? '')) ?? null
    const text = document.body?.innerText ?? ''
    function val (labels) {
      for (const lbl of labels) {
        const re = new RegExp(`\\b${lbl}\\b\\s*[:\\n]?\\s*([^\\n]+)`, 'i')
        const m = text.match(re)
        if (m) return m[1].trim()
      }
      return null
    }
    const priceMatch = text.match(/(?:SAR|ر\.س|ريال)\s*([\d,]+)/i)
    const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : null
    const title = document.querySelector('h1, h2')?.textContent?.trim() ?? null
    const photos = [...new Set([...document.querySelectorAll('img[src]')].map(i => i.src)
      .filter(s => /digitalcar|cdn|cloudfront|amazonaws|s3/i.test(s) && /\.(jpe?g|png|webp)/i.test(s)))].slice(0, 20)
    return {
      carLd, title, price, photos,
      year: parseInt(val(['Year', 'Manufacturing Year', 'سنة الصنع'])) || null,
      mileageRaw: val(['Mileage', 'Kilometers', 'الممشى']),
      makeRaw: val(['Make', 'Brand', 'الماركة']),
      modelRaw: val(['Model', 'الموديل']),
      trimRaw: val(['Trim', 'Variant', 'الفئة']),
      bodyRaw: val(['Body Type', 'Body', 'الشكل']),
      fuelRaw: val(['Fuel Type', 'Fuel', 'نوع الوقود']),
      transRaw: val(['Transmission', 'ناقل الحركة']),
      colorRaw: val(['Color', 'Exterior Color', 'اللون']),
      cityRaw: val(['City', 'Location', 'المدينة']),
      seatsRaw: val(['Seats', 'عدد المقاعد']),
      doorsRaw: val(['Doors', 'عدد الغمارات']),
    }
  }).catch(() => null)

  if (!data) return null
  const ld = data.carLd
  // Slug-derived fallback: URL contains arabic make/model/year tokens.
  const decoded = decodeURIComponent(url)
  const yearMatch = decoded.match(/_(\d{4})$/) || decoded.match(/(\d{4})/)
  const yearFromUrl = yearMatch ? parseInt(yearMatch[1]) : null
  const fuelFromUrl = /gasoline/i.test(decoded) ? 'petrol' : /diesel/i.test(decoded) ? 'diesel' : /hybrid/i.test(decoded) ? 'hybrid' : null
  const transFromUrl = /automatic/i.test(decoded) ? 'automatic' : /manual/i.test(decoded) ? 'manual' : null

  const make = ld?.brand?.name ?? (typeof ld?.brand === 'string' ? ld.brand : null) ?? data.makeRaw
  const model = (typeof ld?.model === 'string' ? ld.model : ld?.model?.name) ?? data.modelRaw
  const price = parseInt(ld?.offers?.price) || data.price || null
  if (!price) return null
  const year = ld?.vehicleModelDate ? parseInt(ld.vehicleModelDate) : (data.year ?? yearFromUrl)
  const mileage = ld?.mileageFromOdometer?.value ? Math.round(parseFloat(ld.mileageFromOdometer.value))
    : (data.mileageRaw ? parseInt(data.mileageRaw.replace(/[^0-9]/g, '')) || null : null)
  const photos = (Array.isArray(ld?.image) ? ld.image : (ld?.image ? [ld.image] : null)) ?? data.photos

  // DigitalCar lists primarily new dealer inventory. Mark accordingly.
  const condition = mileage && mileage > 1000 ? 'used' : 'new'

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
      condition,
      price_sar: price,
      mileage_km: mileage && mileage > 0 ? mileage : null,
      city_en: data.cityRaw, city_ar: null,
      color_en: ld?.color ?? data.colorRaw, color_ar: null,
      fuel_type: canonicalFuel(ld?.vehicleEngine?.fuelType ?? data.fuelRaw) ?? fuelFromUrl,
      transmission: canonicalTrans(ld?.vehicleTransmission ?? data.transRaw) ?? transFromUrl,
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
