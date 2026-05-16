'use strict'
// scripts/scrapers/dubizzle.js — dubizzle.sa/en/vehicles/cars-for-sale/
// Tier 3, highest-volume classifieds source (~17k expected).
//
// Special rules per refactor spec:
//   - playwright-extra + stealth REQUIRED (Dubizzle aggressively fingerprints)
//   - 4-second per-page minimum delay
//   - Skip listings with no price
//   - Skip listings from sellers with 100+ active listings (dealer spam)
//   - Stress test mode: --stress-test scrapes 200 listings and reports
//     rate-limit events; if blocked, scale to 8s and concurrency 1.

const { launchBrowser } = require('./_shared/playwright')
const { RawWriter }     = require('./_shared/raw-writer')

const argv = process.argv.slice(2)
const arg  = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
const flag = (n) => argv.includes(n)
const LIMIT       = arg('--limit')      ? parseInt(arg('--limit'), 10) : null
const HEADED      = flag('--headed')
const INCREMENTAL = flag('--incremental')
const STRESS      = flag('--stress-test')

let MIN_DELAY = 4000
let MAX_DELAY = 6500
const PAGE_TIMEOUT = 45000
const MAX_PAGES = 600

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const rndDelay = () => sleep(MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY))
const log = (...a) => process.stderr.write(`[dubizzle] ${a.join(' ')}\n`)

const SEARCH_BASE = 'https://www.dubizzle.sa/en/vehicles/cars-for-sale/'
// Per-make routes recover the long tail (main /cars-for-sale/ caps quickly).
// Dubizzle's Riyadh route alone shows 16,356 ads; per-make sweep yields 2-3k
// per major brand. Combined sweep covers the full ~17k inventory.
const MAKES = [
  'toyota','hyundai','kia','nissan','gmc','chevrolet','ford','lexus','honda',
  'mitsubishi','bmw','mercedes-benz','jeep','land-rover','audi','dodge',
  'cadillac','infiniti','genesis','mazda','haval','mg','geely','renault',
  'volkswagen','porsche','peugeot','suzuki','subaru','volvo','jetour',
  'changan','byd','dongfeng','ram','isuzu','jaguar','mini','lincoln',
  'chery','exeed',
]

function canonicalFuel (raw) {
  if (!raw) return null
  const s = String(raw).toLowerCase()
  if (s.includes('petrol') || s.includes('gas')) return 'petrol'
  if (s.includes('diesel'))                       return 'diesel'
  if (s.includes('hybrid'))                       return 'hybrid'
  if (s.includes('electric') || s.includes('ev')) return 'electric'
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

let blockedCount = 0
function isBlocked (status, bodyText) {
  if (status === 429 || status === 403) return true
  if (bodyText && /captcha|please verify|robot/i.test(bodyText.slice(0, 500))) return true
  return false
}

async function harvestUrlPage (page, url) {
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT })
    const status = resp?.status() ?? 0
    const body = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '')
    if (isBlocked(status, body)) {
      blockedCount++
      MIN_DELAY = Math.max(MIN_DELAY, 8000); MAX_DELAY = Math.max(MAX_DELAY, 12000)
      await sleep(15000)
      return { blocked: true, items: [] }
    }
    await sleep(2500)
    const items = await page.evaluate(() =>
      [...new Set([...document.querySelectorAll('a[href*="/ad/"]')]
        .map(a => a.href)
        .filter(h => /\/ad\/[a-z0-9-]+/i.test(h))
        .map(h => h.split('?')[0]))]
    )
    return { blocked: false, items: items.filter(u => !/\/(motorcycle|boat|truck|spare-parts)/i.test(u)) }
  } catch (e) {
    return { blocked: false, items: [], error: e.message?.slice(0, 80) }
  }
}

async function collectUrls (browser) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US', ignoreHTTPSErrors: true,
  })
  const page = await ctx.newPage()
  const urls = new Map()
  const maxIds = STRESS ? 200 : (LIMIT ? LIMIT * 2 : Infinity)

  async function sweepRoute (label, urlFn) {
    let consecutiveEmpty = 0
    for (let pg = 1; pg <= MAX_PAGES; pg++) {
      if (urls.size >= maxIds) return
      if (consecutiveEmpty >= 2) return
      const url = urlFn(pg)
      const { blocked, items, error } = await harvestUrlPage(page, url)
      if (blocked) { consecutiveEmpty++; continue }
      const prev = urls.size
      for (const u of items) {
        const id = u.split('/').filter(Boolean).pop()
        if (id && !urls.has(id)) urls.set(id, u)
      }
      const added = urls.size - prev
      log(`${label} p${pg}: ${items.length} cards, +${added} new (total ${urls.size})`)
      if (added === 0) consecutiveEmpty++; else consecutiveEmpty = 0
      if (error) log(`  err: ${error}`)
      await rndDelay()
    }
  }

  // 1. Main listing route — first slice (caps ~150).
  await sweepRoute('main', (pg) => pg === 1 ? SEARCH_BASE : `${SEARCH_BASE}?page=${pg}`)
  // 2. Per-make sweep — recovers the long tail. Each make page has its own
  //    pagination ceiling; together they cover the full inventory.
  for (const make of MAKES) {
    if (urls.size >= maxIds) break
    await sweepRoute(make, (pg) => `${SEARCH_BASE}${make}/${pg === 1 ? '' : '?page=' + pg}`)
  }

  await ctx.close()
  return [...urls.entries()].map(([id, url]) => ({ id, url }))
}

async function extractListing (page, url, id) {
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT })
    const status = resp?.status() ?? 0
    if (status >= 400) return null
    await sleep(2500)
  } catch { return null }
  const data = await page.evaluate(() => {
    const text = document.body?.innerText ?? ''
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    // Dubizzle renders specs as "Label\nValue" pairs (no colon).
    function valNext (labels) {
      for (const lbl of labels) {
        const idx = lines.indexOf(lbl)
        if (idx >= 0 && lines[idx + 1]) return lines[idx + 1]
      }
      return null
    }
    // Price: "SR 85,000" — note SR (Riyal abbreviation), not SAR.
    let price = null
    for (const ln of lines) {
      const m = ln.match(/^(?:SR|SAR|ر\.س)\s+([\d,]+)$/i)
      if (m) { price = parseInt(m[1].replace(/,/g, '')) || null; break }
    }
    if (!price) {
      const m = text.match(/(?:SR|SAR)\s*([\d,]{3,})/i)
      if (m) price = parseInt(m[1].replace(/,/g, '')) || null
    }
    const title = document.querySelector('h1')?.textContent?.trim() ?? null
    const photos = [...new Set([...document.querySelectorAll('img[src]')].map(i => i.src)
      .filter(s => /dubizzle|opensooq|cdn|cloudfront/i.test(s)))].slice(0, 20)
    const sellerActiveMatch = text.match(/(\d+)\s+(?:active\s+ads|listings|other ads)/i)
    const sellerActive = sellerActiveMatch ? parseInt(sellerActiveMatch[1]) : null
    const sellerVerified = /verified\s*seller/i.test(text)

    // City: "Riyadh, Riyadh" pattern — appears near top right after price/title.
    let city = null
    const cityMatch = text.match(/\n([A-Z][\w\s']+),\s*([A-Z][\w\s]+)\n/)
    if (cityMatch) city = cityMatch[1].trim()

    return {
      title, price, photos, city,
      year: parseInt(valNext(['Year', 'Manufacturing Year'])) || null,
      mileageRaw: valNext(['Kilometers', 'Mileage', 'Kms', 'Kilometres']),
      makeRaw:    valNext(['Brand', 'Make']),
      modelRaw:   valNext(['Model']),
      trimRaw:    valNext(['Version', 'Trim', 'Variant']),
      bodyRaw:    valNext(['Body Type', 'Body']),
      fuelRaw:    valNext(['Fuel Type', 'Fuel']),
      transRaw:   valNext(['Transmission Type', 'Transmission', 'Gearbox']),
      colorRaw:   valNext(['Color', 'Exterior Color']),
      cityRaw:    valNext(['City', 'Location']),
      neighborhoodRaw: valNext(['Neighborhood', 'Neighbourhood', 'Area']),
      seatsRaw:   valNext(['Number of seats', 'Seats', 'Seating Capacity']),
      doorsRaw:   valNext(['Number of doors', 'Doors']),
      postedRaw:  valNext(['Posted on', 'Posted Date', 'Date Posted']),
      conditionRaw: valNext(['Condition']),
      sellerActive,
      sellerVerified,
      description: (() => {
        const descIdx = lines.indexOf('Description')
        if (descIdx < 0) return null
        return lines.slice(descIdx + 1, descIdx + 30).join(' ').slice(0, 1500)
      })(),
    }
  }).catch(() => null)
  if (!data) return null
  if (!data.price || data.price <= 0) return null   // skip "contact for price"
  if (data.sellerActive && data.sellerActive >= 100) return null    // dealer spam
  const make = data.makeRaw || null
  const model = data.modelRaw || null
  if (!make || !model) return null
  const mileage = data.mileageRaw ? parseInt(data.mileageRaw.replace(/[^0-9]/g, '')) || null : null
  return {
    source_id: id,
    source_url: url,
    structured_data: {
      source_id: id,
      source_url: url,
      title: data.title,
      make_en: make,  make_ar: null,
      model_en: model, model_ar: null,
      trim: data.trimRaw,
      year: data.year,
      condition: 'used',
      price_sar: data.price,
      mileage_km: mileage && mileage > 0 ? mileage : null,
      city_en: data.cityRaw || data.city,
      city_ar: null,
      neighborhood: data.neighborhoodRaw,
      color_en: data.colorRaw,
      color_ar: null,
      fuel_type: canonicalFuel(data.fuelRaw),
      transmission: canonicalTrans(data.transRaw),
      body_type: canonicalBody(data.bodyRaw),
      drive_type: null,
      engine_size_l: null,
      doors: data.doorsRaw ? parseInt(data.doorsRaw) || null : null,
      seats: data.seatsRaw ? parseInt(data.seatsRaw) || null : null,
      seller_type: data.sellerVerified ? 'verified' : 'private',
      seller_active_count: data.sellerActive,
      photos: data.photos,
      description_ar: data.description,
      posted_at: data.postedRaw,
    },
  }
}

;(async () => {
  log(`start (${STRESS ? 'STRESS_TEST_200' : LIMIT ? `limit=${LIMIT}` : 'full'})`)
  const t0 = Date.now()
  const writer = new RawWriter({ source: 'dubizzle' })

  let skipSet = new Set()
  if (INCREMENTAL) {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const { data } = await writer.sb.from('raw_listings').select('source_id').eq('source', 'dubizzle').gte('scraped_at', since)
    skipSet = new Set((data ?? []).map(r => r.source_id))
    log(`incremental: ${skipSet.size} recent rows skipped`)
  }

  const { browser } = await launchBrowser({ headless: !HEADED })
  const urls = await collectUrls(browser)
  log(`Phase 1 done — ${urls.length} listing URLs; blocked events: ${blockedCount}`)

  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US', ignoreHTTPSErrors: true,
  })
  const page = await ctx.newPage()

  let successes = 0
  for (const { id, url } of urls) {
    if (STRESS && successes >= 200) break
    if (LIMIT && successes >= LIMIT) break
    if (skipSet.has(id)) continue
    const r = await extractListing(page, url, id)
    if (r) {
      await writer.add(r)
      successes++
      if (successes % 25 === 0) log(`  scraped ${successes}/${urls.length} (blocked=${blockedCount})`)
    }
    await rndDelay()
  }

  await ctx.close()
  await writer.close()
  await browser.close()
  log(`done — ${successes}/${urls.length} in ${((Date.now()-t0)/1000).toFixed(1)}s; blocked=${blockedCount}`)
  log(`raw_writer totals: ${JSON.stringify(writer.totals)}`)
  if (STRESS) {
    if (blockedCount > 5) {
      log('STRESS RESULT: BLOCKED RATE > 5 events — recommend running at 8s/concurrency 1 or stopping')
    } else {
      log('STRESS RESULT: clean — safe to proceed to full scrape')
    }
  }
})().catch(e => { console.error(e); process.exit(1) })
