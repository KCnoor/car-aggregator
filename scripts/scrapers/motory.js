'use strict'
// scripts/scrapers/motory.js — ksa.motory.com (Pipeline v2, Tier 2)
//
// Motory is an Angular SSR site. JSON-LD `Car` is rendered into page HTML;
// brand and model names come through in Arabic. Layer 2's normalize.js uses
// the shared translation dictionary to resolve those to English slugs.
//
// Phase 1: discover all listing URLs via pagination on the main listing page,
//          supplemented by per-make browse pages. NO TARGET CAP.
// Phase 2: per-listing JSON-LD extraction.

const path = require('path')
const { launchBrowser } = require('./_shared/playwright')
const { RawWriter }     = require('./_shared/raw-writer')

const argv = process.argv.slice(2)
const arg  = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
const flag = (n) => argv.includes(n)

const LIMIT       = arg('--limit') ? parseInt(arg('--limit'), 10) : null
const HEADED      = flag('--headed')
const INCREMENTAL = flag('--incremental')

const PAGE_TIMEOUT = 35000
const PHASE1_DELAY = 5000
const DETAIL_MIN   = 2000
const DETAIL_MAX   = 4000
const MAX_PAGES    = 200    // hard upper bound (still 16× legacy)
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const rndDelay = () => sleep(DETAIL_MIN + Math.random() * (DETAIL_MAX - DETAIL_MIN))
const log = (...a) => process.stderr.write(`[motory] ${a.join(' ')}\n`)

const BASE = 'https://ksa.motory.com'
const LISTINGS_AR_PATH = encodeURIComponent('حراج-السيارات')

// Motory's main pagination caps around page 76 (~1,500 listings). Per-make
// routes have their own pagination — together they cover the full ~6,000.
const BROWSE_MAKES_AR = [
  'تويوتا', 'كيا', 'هيونداي', 'نيسان', 'لكزس',
  'فورد', 'هوندا', 'ميتسوبيشي', 'جيلي', 'هافال',
  'إم-جي', 'جينيسيس', 'انفينيتي', 'مازدا', 'دودج',
  'جيب', 'شانجان', 'مرسيدس', 'بي-إم-دبليو', 'أودي',
  'بي-واي-دي', 'فولفو', 'بورش', 'رينو', 'شيري',
  'سوزوكي', 'فولكسفاجن', 'بيجو', 'لاند روفر', 'جي-إم-سي',
  'شيفروليه', 'كاديلاك', 'بنتلي', 'فيراري', 'لامبورجيني',
]

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
]
let uaIdx = 0
const nextUA = () => USER_AGENTS[uaIdx++ % USER_AGENTS.length]

function listingId (url) {
  const m = decodeURIComponent(url).match(/\/(\d+)\/?(?:[#?]|$)/)
  return m ? m[1] : null
}

function parseIntSafe (raw) {
  if (raw == null) return null
  const n = parseInt(String(raw).replace(/[^0-9]/g, ''))
  return Number.isFinite(n) && n > 1 ? n : null   // Motory uses 1 as placeholder
}

function parseMileageMotory (raw) {
  if (raw == null) return null
  if (typeof raw === 'object' && raw.value != null) {
    const n = Math.round(parseFloat(String(raw.value)))
    return Number.isFinite(n) && n > 1 ? n : null
  }
  return parseIntSafe(raw)
}

function cityArFromUrl (url) {
  const m = decodeURIComponent(url).match(/حراج-السيارات\/حراج-([^/]+)\//)
  return m ? m[1] : null
}

// ── Phase 1: URL discovery via pagination ──────────────────────────────────
async function harvestUrlPage (browser, url) {
  const ctx = await browser.newContext({ userAgent: nextUA(), locale: 'ar-SA', ignoreHTTPSErrors: true })
  const page = await ctx.newPage()
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT })
    if ((resp?.status() ?? 0) >= 400) return { hrefs: [], status: resp?.status() }
    await sleep(PHASE1_DELAY)
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll('a[href]')].map(a => a.href).filter(h => /\/\d{4}\/\d{4,}\/?$/.test(h))
    )
    return { hrefs, status: resp?.status() ?? 0 }
  } catch (e) {
    return { hrefs: [], error: e.message?.slice(0, 80) }
  } finally {
    await ctx.close()
  }
}

async function collectUrls (browser) {
  const seen = new Map()

  async function sweepRoute (label, urlFn) {
    let stall = 0
    for (let pg = 1; pg <= MAX_PAGES; pg++) {
      if (LIMIT && seen.size >= LIMIT * 2) return
      if (stall >= 2) return
      const url = urlFn(pg)
      const { hrefs, status, error } = await harvestUrlPage(browser, url)
      if (status && status >= 400) { log(`${label} p${pg} HTTP ${status}`); return }
      let added = 0
      for (const h of hrefs) {
        const id = listingId(h)
        if (id && !seen.has(id)) { seen.set(id, h.split('#')[0]); added++ }
      }
      if (pg === 1 || added > 0 || stall === 0) log(`${label} p${pg}: +${added} (total ${seen.size})`)
      if (added === 0) stall++; else stall = 0
      if (error) log(`${label} p${pg} err: ${error}`)
      await sleep(1200 + Math.random() * 500)
    }
  }

  // 1. Main listing route (caps ~76 pages).
  await sweepRoute('main', (pg) => pg === 1
    ? `${BASE}/ar/${LISTINGS_AR_PATH}/`
    : `${BASE}/ar/${LISTINGS_AR_PATH}/?page=${pg}`)
  // 2. Per-make routes — recover the long tail.
  for (const makeAr of BROWSE_MAKES_AR) {
    if (LIMIT && seen.size >= LIMIT * 2) break
    await sweepRoute(`make[${makeAr}]`, (pg) => {
      const base = `${BASE}/ar/${LISTINGS_AR_PATH}/${encodeURIComponent(makeAr)}/`
      return pg === 1 ? base : `${base}?page=${pg}`
    })
  }
  log(`URL discovery done: ${seen.size} unique`)
  return [...seen.values()]
}

// ── Phase 2: per-listing extraction ────────────────────────────────────────
async function extractListing (page, url) {
  const raw = await page.evaluate(() => {
    const ldObjects = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map(s => { try { return JSON.parse(s.textContent) } catch { return null } })
      .filter(Boolean)
    const carLd = ldObjects.find(o => o['@type'] === 'Car') ?? null
    const cashEl = document.querySelector('.object.cash')
    const priceHidden = cashEl?.classList.contains('no-currency') ?? false
    const priceHtml = priceHidden ? null : parseInt((cashEl?.innerText ?? '').replace(/[^0-9]/g, '')) || null
    const sellerLabel = document.querySelector('.dealer-individual-label')?.innerText?.trim() ?? null
    const sellerName  = document.querySelector('.seller-info-link-text')?.innerText?.trim() ?? null
    const specs = {}
    document.querySelectorAll('.info').forEach(row => {
      const label = row.querySelector('.info-title')?.innerText?.trim()
      const value = row.querySelector('.info-result-text')?.innerText?.trim()
      if (label && value) specs[label] = value
    })
    return { carLd, priceHtml, sellerLabel, sellerName, specs }
  }).catch(() => null)
  if (!raw || !raw.carLd) return null
  const ld = raw.carLd

  const price = parseIntSafe(ld?.offers?.price) ?? parseIntSafe(raw.priceHtml)
  const mileage = parseMileageMotory(ld?.mileageFromOdometer)
  const year = ld?.vehicleModelDate ? parseInt(ld.vehicleModelDate) : null
  const makeAr = ld?.brand?.name ?? (typeof ld?.brand === 'string' ? ld.brand : null)
  const modelAr = typeof ld?.model === 'string' ? ld.model : ld?.model?.name ?? null
  const trim = ld?.vehicleConfiguration ?? null
  const condRaw = ld?.itemCondition ?? ''
  const condition = /UsedCondition|مستعمل/i.test(condRaw) ? 'used' : /NewCondition|جديد/i.test(condRaw) ? 'new' : 'used'

  // Body type from JSON-LD bodyType (Motory exposes English values here)
  const bodyTypeRaw = ld?.bodyType ?? null
  const bodyType = bodyTypeRaw ? String(bodyTypeRaw).toLowerCase()
    .replace(/saloon/, 'sedan')
    .replace(/^.*(suv|crossover).*$/, 'suv')
    .replace(/^.*(pickup|pick-up).*$/, 'pickup')
    .replace(/^.*(coupe|coupé).*$/, 'coupe')
    .replace(/^.*hatchback.*$/, 'hatchback')
    .replace(/^.*(van|mpv).*$/, 'van')
    .replace(/^.*(wagon|estate).*$/, 'wagon')
    .replace(/^.*sedan.*$/, 'sedan')
    : null

  const fuelRaw = ld?.vehicleEngine?.fuelType ?? raw.specs['نوع المحرك'] ?? null
  const transmRaw = ld?.vehicleTransmission ?? raw.specs['ناقل الحركة'] ?? null
  const driveRaw = ld?.driveWheelConfiguration ?? null
  const driveType = driveRaw && typeof driveRaw === 'string'
    ? driveRaw.replace(/^https?:\/\/schema\.org\//, '').replace(/DriveConfiguration$/, '').toLowerCase()
    : null
  const engineRaw = ld?.vehicleEngine?.engine ?? raw.specs['سعة المحرك'] ?? null
  const engineSize = engineRaw ? parseFloat(String(engineRaw).replace(/[^0-9.]/g, '')) || null : null
  const doors = ld?.numberOfDoors ? parseInt(ld.numberOfDoors) : null
  const seats = ld?.vehicleSeatingCapacity ? parseInt(ld.vehicleSeatingCapacity) : null
  const colorAr = ld?.color ?? raw.specs['اللون'] ?? null
  const photos = Array.isArray(ld?.image) ? ld.image : (ld?.image ? [ld.image] : [])
  const cityAr = cityArFromUrl(url) ?? raw.specs['المدينة'] ?? null
  const title = ld?.name ?? null
  const description = ld?.description ?? null
  const sellerType = (raw.sellerLabel?.includes('معرض') || raw.sellerLabel?.includes('مندوب'))
    ? 'dealer' : 'private'

  // Map fuel slug
  const fuelSlug = (() => {
    if (!fuelRaw) return null
    const s = String(fuelRaw)
    if (/petrol|gasoline|بنزين/i.test(s)) return 'petrol'
    if (/diesel|ديزل/i.test(s))           return 'diesel'
    if (/hybrid|هايبرد|هجين/i.test(s))    return 'hybrid'
    if (/electric|كهربائي/i.test(s))      return 'electric'
    return null
  })()
  const transSlug = (() => {
    if (!transmRaw) return null
    if (/automatic|cvt|auto|أوتوماتيك|اوتو/i.test(transmRaw)) return 'automatic'
    if (/manual|يدوي/i.test(transmRaw))                       return 'manual'
    return null
  })()

  const sourceId = listingId(url)
  return {
    source_id: sourceId,
    source_url: url.split('#')[0],
    structured_data: {
      source_id: sourceId,
      source_url: url.split('#')[0],
      title,
      make_ar: makeAr,
      make_en: null,    // resolved by Layer 2 via translations.json
      model_ar: modelAr,
      model_en: null,   // resolved by Layer 2
      trim, year, condition,
      price_sar: price,
      mileage_km: mileage,
      city_ar: cityAr,
      city_en: null,    // resolved by Layer 2
      color_ar: colorAr,
      color_en: null,
      fuel_type: fuelSlug,
      transmission: transSlug,
      body_type: bodyType,
      drive_type: driveType,
      engine_size_l: engineSize,
      doors, seats,
      seller_type: sellerType,
      seller_name: raw.sellerName,
      photos,
      description_ar: description,
    },
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
;(async () => {
  log(`start (${LIMIT ? `limit=${LIMIT}` : 'full'}${INCREMENTAL ? ', incremental' : ''})`)
  const t0 = Date.now()
  const writer = new RawWriter({ source: 'motory' })

  let skipSet = new Set()
  if (INCREMENTAL) {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const { data } = await writer.sb.from('raw_listings').select('source_id').eq('source', 'motory').gte('scraped_at', since)
    skipSet = new Set((data ?? []).map(r => r.source_id))
    log(`incremental: ${skipSet.size} recent rows skipped`)
  }

  const { browser } = await launchBrowser({ headless: !HEADED })
  const urls = await collectUrls(browser)

  let ctx = await browser.newContext({ userAgent: nextUA(), locale: 'ar-SA', ignoreHTTPSErrors: true })
  let page = await ctx.newPage()
  let ctxUses = 0
  const rotate = async () => {
    await ctx.close()
    ctx = await browser.newContext({ userAgent: nextUA(), locale: 'ar-SA', ignoreHTTPSErrors: true })
    page = await ctx.newPage()
    ctxUses = 0
  }

  let successes = 0
  let processed = 0
  for (const url of urls) {
    if (LIMIT && successes >= LIMIT) break
    const id = listingId(url)
    if (skipSet.has(id)) { processed++; continue }
    if (ctxUses > 0 && ctxUses % 30 === 0) { await rotate(); log('  rotated ctx') }
    processed++

    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT })
      const status = resp?.status() ?? 0
      if (status === 403 || status === 429) {
        log(`  BLOCKED ${status}; sleeping 15s and rotating`)
        await sleep(15000); await rotate(); continue
      }
      if (status >= 400) { log(`  HTTP ${status}`); await rndDelay(); continue }
      await sleep(3000 + Math.random() * 2000)
      const r = await extractListing(page, url)
      ctxUses++
      if (r) {
        await writer.add(r)
        successes++
        if (successes % 25 === 0) log(`  scraped ${successes}/${urls.length}`)
      }
    } catch (e) {
      log(`  ERROR ${url.slice(-40)}: ${e.message?.slice(0, 80)}`)
    }
    await rndDelay()
  }

  await ctx.close()
  await writer.close()
  await browser.close()
  log(`done — ${successes}/${urls.length} in ${((Date.now()-t0)/1000).toFixed(1)}s`)
  log(`raw_writer totals: ${JSON.stringify(writer.totals)}`)
})().catch(e => { console.error(e); process.exit(1) })
