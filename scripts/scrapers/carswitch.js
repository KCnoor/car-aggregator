'use strict'
// scripts/scrapers/carswitch.js — ksa.carswitch.com/en/saudi/used-cars
// Tier 1 + special: captures CarSwitch's algorithmic price labels
// ("Great price", "Good price", "Fair price", "X% off") into external_price_label
// for free validation against our deal_score_v2.
//
// Phase 1: paginate the search page until empty.
// Phase 2: visit each listing detail page and extract structured fields plus
//          the price label and platform_metadata (saudi specs, loan available,
//          monthly installment, inspection report).

const { launchBrowser } = require('./_shared/playwright')
const { RawWriter }     = require('./_shared/raw-writer')

const argv = process.argv.slice(2)
const arg  = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
const flag = (n) => argv.includes(n)
const LIMIT       = arg('--limit') ? parseInt(arg('--limit'), 10) : null
const HEADED      = flag('--headed')
const INCREMENTAL = flag('--incremental')

const PAGE_TIMEOUT = 35000
const MIN_DELAY = 3000   // 3-second per-page minimum per spec
const MAX_DELAY = 5000
const MAX_PAGES = 300

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const rndDelay = () => sleep(MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY))
const log = (...a) => process.stderr.write(`[carswitch] ${a.join(' ')}\n`)

const SEARCH_BASE = 'https://ksa.carswitch.com/en/saudi/used-cars/search'

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
  if (s.includes('van') || s.includes('mpv'))        return 'van'
  if (s.includes('coupe'))                           return 'coupe'
  if (s.includes('hatch'))                           return 'hatchback'
  if (s.includes('wagon'))                           return 'wagon'
  if (s.includes('sedan') || s.includes('saloon'))   return 'sedan'
  return null
}

// Map a label text → canonical external_price_label string.
function priceLabel (text) {
  if (!text) return null
  const t = String(text).toLowerCase().trim()
  if (/great\s*price/.test(t)) return 'great_price'
  if (/good\s*price/.test(t))  return 'good_price'
  if (/fair\s*price/.test(t))  return 'fair_price'
  const off = t.match(/(\d+(?:\.\d+)?)\s*%\s*off/)
  if (off) return `discount_${Math.round(parseFloat(off[1]))}_percent`
  return null
}

// ── Phase 1: paginate search → collect listing URLs ────────────────────────
async function collectUrls (browser) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US', ignoreHTTPSErrors: true,
  })
  const page = await ctx.newPage()
  const urls = new Map()    // id → url
  let consecutiveEmpty = 0
  for (let pageNum = 1; pageNum <= MAX_PAGES && consecutiveEmpty < 2; pageNum++) {
    const url = pageNum === 1 ? SEARCH_BASE : `${SEARCH_BASE}?page=${pageNum}`
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT })
      await sleep(3000)
      const items = await page.evaluate(() =>
        [...new Set([...document.querySelectorAll('a[href*="/used-cars/"]')]
          .map(a => a.href)
          // Detail URLs typically have /used-cars/{make}/{model}/{slug-id}
          .filter(h => /\/used-cars\/[a-z0-9-]+\/[a-z0-9-]+\//i.test(h) && !h.includes('/search')))]
      )
      const prev = urls.size
      for (const u of items) {
        // Extract numeric/alpha id from URL path
        const m = u.match(/-(\d+)\/?$/) || u.match(/\/([a-z0-9]+)\/?$/)
        const id = m ? m[1] : u.split('/').filter(Boolean).pop()
        if (id && !urls.has(id)) urls.set(id, u.split('?')[0])
      }
      const added = urls.size - prev
      log(`page ${pageNum}: +${added} new (total ${urls.size})`)
      if (added === 0) consecutiveEmpty++; else consecutiveEmpty = 0
    } catch (e) {
      log(`page ${pageNum} error: ${e.message?.slice(0, 80)}`)
      consecutiveEmpty++
    }
    if (LIMIT && urls.size >= LIMIT * 2) break
    await rndDelay()
  }
  await ctx.close()
  return [...urls.entries()].map(([id, url]) => ({ id, url }))
}

// ── Phase 2: detail page extraction ────────────────────────────────────────
async function extractListing (page, url, id) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT })
    await sleep(2500)
  } catch {
    return null
  }
  const data = await page.evaluate(() => {
    const text = (document.body.innerText || '')
    // CarSwitch typically renders structured key-value pairs as labelled spans.
    function valueAfter (labels) {
      const lower = text.toLowerCase()
      for (const lbl of labels) {
        const idx = lower.indexOf(lbl.toLowerCase())
        if (idx >= 0) {
          const slice = text.slice(idx + lbl.length, idx + lbl.length + 60)
          const cleaned = slice.replace(/^[:\s]+/, '').split('\n')[0].trim()
          if (cleaned) return cleaned
        }
      }
      return null
    }
    function findPriceLabel () {
      // Look for "Great price", "Good price", "Fair price", or "X% off" badge near the price.
      const candidates = [...document.querySelectorAll('span, div, p, button')]
        .map(el => el.textContent?.trim() ?? '')
        .filter(t => /great\s*price|good\s*price|fair\s*price|\d+(\.\d+)?\s*%\s*off/i.test(t))
      return candidates[0] ?? null
    }
    function flag (regex) { return regex.test(text) }
    // Price (first SAR amount near the top)
    const priceMatch = text.match(/SAR\s*([\d,]+)/)
    const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : null
    // Title (h1)
    const title = document.querySelector('h1')?.textContent?.trim() ?? null
    // Photos
    const photos = [...new Set([...document.querySelectorAll('img[src]')].map(img => img.src)
      .filter(s => /carswitch|cdn/i.test(s) && /\.(jpe?g|png|webp)/i.test(s)))].slice(0, 20)
    // Monthly installment
    const instMatch = text.match(/(?:installment|EMI|monthly)[^\d]{0,30}SAR\s*([\d,]+)/i)
    const monthlyInstallment = instMatch ? parseInt(instMatch[1].replace(/,/g, '')) : null
    return {
      title,
      price,
      year:           parseInt(valueAfter(['Year:', 'Manufacturing Year:'])) || null,
      mileageRaw:     valueAfter(['Mileage:', 'Kilometers:']),
      makeRaw:        valueAfter(['Make:', 'Brand:']),
      modelRaw:       valueAfter(['Model:']),
      trim:           valueAfter(['Trim:', 'Variant:']),
      bodyRaw:        valueAfter(['Body Type:', 'Body:']),
      fuelRaw:        valueAfter(['Fuel Type:', 'Fuel:']),
      transRaw:       valueAfter(['Transmission:', 'Gearbox:']),
      colorRaw:       valueAfter(['Color:', 'Exterior Color:']),
      cityRaw:        valueAfter(['City:', 'Location:']),
      seatsRaw:       valueAfter(['Seats:', 'Number of seats:']),
      doorsRaw:       valueAfter(['Doors:', 'Number of doors:']),
      labelText:      findPriceLabel(),
      photos,
      monthlyInstallment,
      saudiSpecs:     flag(/saudi\s*spec/i),
      loanAvailable:  flag(/\bloan\b|financing/i),
      inspection:     flag(/inspection\s*report|inspected/i),
    }
  }).catch(() => null)
  if (!data) return null
  if (!data.price) return null
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
      trim: data.trim,
      year: data.year,
      condition: 'used',
      price_sar: data.price,
      mileage_km: mileage && mileage > 0 ? mileage : null,
      city_en: data.cityRaw, city_ar: null,
      color_en: data.colorRaw, color_ar: null,
      fuel_type: canonicalFuel(data.fuelRaw),
      transmission: canonicalTrans(data.transRaw),
      body_type: canonicalBody(data.bodyRaw),
      drive_type: null,
      engine_size_l: null,
      doors: data.doorsRaw ? parseInt(data.doorsRaw) || null : null,
      seats: data.seatsRaw ? parseInt(data.seatsRaw) || null : null,
      seller_type: 'dealer',
      photos: data.photos,
      description_ar: null,
    },
    external_price_label: priceLabel(data.labelText),
    platform_metadata: {
      saudi_specs:         data.saudiSpecs,
      loan_available:      data.loanAvailable,
      monthly_installment: data.monthlyInstallment,
      inspection_report:   data.inspection,
    },
  }
}

;(async () => {
  log(`start (${LIMIT ? `limit=${LIMIT}` : 'full'})`)
  const t0 = Date.now()
  const writer = new RawWriter({ source: 'carswitch' })

  let skipSet = new Set()
  if (INCREMENTAL) {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const { data } = await writer.sb.from('raw_listings').select('source_id').eq('source', 'carswitch').gte('scraped_at', since)
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
