'use strict'
// scripts/scrapers/soum.js — soum.sa used car listings (Pipeline v2, Tier 1)
//
// Strategy:
//   Phase 1 — discover all (make, model) category URLs by crawling the
//             /en/cars hub and per-make landing pages. NO TARGET CAPS.
//   Phase 2 — for each category, scroll to exhaustion and collect all
//             /product/{slug}-{24-hex-id} URLs.
//   Phase 3 — for each product page, extract structured fields and stream
//             into raw_listings.

const fs   = require('fs')
const path = require('path')
const { launchBrowser } = require('./_shared/playwright')
const { RawWriter }     = require('./_shared/raw-writer')

const argv = process.argv.slice(2)
const arg  = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
const flag = (n) => argv.includes(n)

const LIMIT       = arg('--limit') ? parseInt(arg('--limit'), 10) : null
const HEADED      = flag('--headed')
const INCREMENTAL = flag('--incremental')

const PAGE_TIMEOUT = 30000
const SCROLL_PAUSE_MS = 1500
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const log = (...a) => process.stderr.write(`[soum] ${a.join(' ')}\n`)

// Hub URL exposes the make taxonomy.
const HUB_URL  = 'https://soum.sa/en/cars'
// 24-hex product IDs.
const PRODUCT_ID_RE = /([0-9a-f]{24})/

// Parse a mileage range string like "80,000 - 150,000KM" → midpoint.
function parseMileageRange (raw) {
  if (!raw) return null
  const nums = raw.replace(/[^0-9,-]/g, '')
    .split('-')
    .map(s => parseInt(s.replace(/,/g, '')))
    .filter(n => !isNaN(n))
  if (nums.length >= 2) return Math.round((nums[0] + nums[1]) / 2)
  if (nums.length === 1) return nums[0]
  return null
}

function canonicalBodyType (raw) {
  if (!raw) return null
  const t = String(raw).toLowerCase().trim()
  if (t.includes('suv') || t.includes('crossover'))                          return 'suv'
  if (t.includes('pickup') || t.includes('pick-up'))                         return 'pickup'
  if (t.includes('van') || t.includes('mpv'))                                return 'van'
  if (t.includes('coupe'))                                                   return 'coupe'
  if (t.includes('hatchback'))                                               return 'hatchback'
  if (t.includes('wagon') || t.includes('estate'))                           return 'wagon'
  if (t.includes('sedan') || t.includes('saloon'))                           return 'sedan'
  return null
}

// ── Phase 1: discover make → model URLs ─────────────────────────────────────
async function discoverCategories (browser) {
  const ctx  = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US', ignoreHTTPSErrors: true,
  })
  const page = await ctx.newPage()

  const makes = new Set()
  try {
    await page.goto(HUB_URL, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT })
    await sleep(2000)
    const links = await page.evaluate(() =>
      [...new Set([...document.querySelectorAll('a[href]')].map(a => a.href)
        .filter(h => /soum\.sa\/en\/cars\/[a-z][\w-]*$/i.test(h)))]
    )
    for (const u of links) {
      const m = u.match(/\/en\/cars\/([\w-]+)$/)
      if (m) makes.add(m[1])
    }
    log(`hub: discovered ${makes.size} make pages`)
  } catch (e) {
    log(`hub error: ${e.message?.slice(0, 80)}`)
  }

  // For each make page, discover model sub-URLs.
  const categories = new Set()
  for (const make of makes) {
    const url = `https://soum.sa/en/cars/${make}`
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT })
      await sleep(1500)
      // Scroll a bit to surface filter chips.
      await page.evaluate(() => window.scrollTo(0, 600))
      await sleep(800)
      const models = await page.evaluate(() =>
        [...new Set([...document.querySelectorAll('a[href]')].map(a => a.href)
          .filter(h => /soum\.sa\/en\/cars\/[\w-]+\/[\w-]+$/i.test(h)))]
      )
      // Always include the make page itself (Soum's filter page often shows mixed listings).
      categories.add(url)
      for (const m of models) categories.add(m)
      log(`  ${make}: +${models.length} model URLs (total ${categories.size})`)
    } catch (e) {
      log(`  ERROR ${make}: ${e.message?.slice(0, 80)}`)
    }
    await sleep(700)
  }
  await ctx.close()
  log(`discovered ${categories.size} category URLs`)
  return [...categories]
}

// ── Phase 2: collect product URLs from one category page (scroll to exhaustion) ─
async function collectProductUrlsFromCategory (page, categoryUrl) {
  try {
    await page.goto(categoryUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT })
    await sleep(2500)
  } catch (e) {
    return []
  }
  const seen = new Set()
  let stale = 0
  for (let i = 0; i < 50 && stale < 3; i++) {  // hard upper bound 50 scrolls
    const links = await page.evaluate(() =>
      [...new Set([...document.querySelectorAll('a[href*="/product/"]')].map(a => a.href))]
    ).catch(() => [])
    const prev = seen.size
    for (const u of links) if (PRODUCT_ID_RE.test(u)) seen.add(u.split('?')[0])
    if (seen.size === prev) stale++
    else stale = 0
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await sleep(SCROLL_PAUSE_MS)
  }
  return [...seen]
}

// ── Phase 3: extract one product page ──────────────────────────────────────
async function extractListing (page, url) {
  const productId = url.match(PRODUCT_ID_RE)?.[1]
  if (!productId) return null
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT })
    await sleep(2500)
  } catch (e) {
    return null
  }
  const data = await page.evaluate(() => {
    const text = document.body?.innerText || ''
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

    // Variant line: e.g. "Yaris | Yaris | 80,000 - 150,000KM | 2023 | Hatchback"
    let variantLine = ''
    for (const line of lines) {
      if (/\|\s*\d{4}\s*\|/.test(line) && !/^\d/.test(line)) { variantLine = line; break }
    }
    let model = null, mileageRaw = null, year = null, bodyType = null
    if (variantLine) {
      const parts = variantLine.split('|').map(p => p.trim())
      model = parts[0] || null
      for (const p of parts) {
        if (/\d{4}/.test(p) && !mileageRaw && p.includes('KM')) { mileageRaw = p; continue }
        if (/^\d{4}$/.test(p)) { year = parseInt(p); continue }
        if (!mileageRaw && /KM/i.test(p)) mileageRaw = p
      }
      bodyType = parts[parts.length - 1] || null
    }

    // Price: first standalone "XX,YYY.YY"
    let priceStr = null
    for (const line of lines) {
      if (/^\d{2,3}[,\d]*\.\d{2}$/.test(line)) { priceStr = line; break }
    }
    const price = priceStr ? parseInt(priceStr.replace(/[,\s]/g, '')) : null

    let make = null
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === 'Brand:' && lines[i + 1]) { make = lines[i + 1]; break }
      if (/^Brand:\s+\w/.test(lines[i])) { make = lines[i].replace('Brand:', '').trim(); break }
    }

    // Try to find color, fuel, transmission, city, seats from "key:value" lines.
    let color = null, fuel = null, transmission = null, city = null, seats = null
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i]
      const nx = lines[i + 1] ?? ''
      const m = ln.match(/^(Color|Body Color|Exterior Color|Fuel Type|Transmission|City|Location|Region|Seats|Seating Capacity|Number of Seats):?\s*(.*)$/i)
      if (m) {
        const key = m[1].toLowerCase()
        const val = (m[2] || nx).trim()
        if (key.includes('color') && !color) color = val
        else if (key.includes('fuel') && !fuel) fuel = val
        else if (key.includes('transmission') && !transmission) transmission = val
        else if ((key.includes('city') || key.includes('location') || key.includes('region')) && !city) city = val
        else if (key.includes('seat') && !seats) seats = parseInt(val)
      }
    }

    const imgs = Array.from(document.querySelectorAll('img[src*="cdn.soum.sa"]'))
      .map(img => img.src.replace(/\?.*$/, ''))
      .filter((v, i, a) => a.indexOf(v) === i)
      .filter(u => u.includes('/listings/'))
      .slice(0, 12)

    const descKeywords = ['inspection', 'warranty', 'guaranteed', 'inspected']
    const desc = lines.filter(l => descKeywords.some(k => l.toLowerCase().includes(k))).join('. ')

    return { variantLine, model, mileageRaw, year, bodyType, price, make, color, fuel, transmission, city, seats, imgs, desc }
  }).catch(() => null)

  if (!data || !data.price || !data.model) return null

  const mileage = parseMileageRange(data.mileageRaw)
  const fuelSlug = data.fuel ? data.fuel.toLowerCase() : null
  const transSlug = data.transmission ? (data.transmission.toLowerCase().includes('auto') ? 'automatic' : data.transmission.toLowerCase().includes('manual') ? 'manual' : null) : null

  return {
    source_id: productId,
    source_url: url.split('?')[0],
    structured_data: {
      source_id: productId,
      source_url: url.split('?')[0],
      title: data.variantLine || `${data.make ?? ''} ${data.model} ${data.year ?? ''}`.trim(),
      make_en:     data.make,
      make_ar:     null,
      model_en:    data.model,
      model_ar:    null,
      trim:        null,
      year:        data.year,
      condition:   'used',
      price_sar:   data.price,
      mileage_km:  mileage,
      city_en:     data.city || null,
      city_ar:     null,
      color_en:    data.color || null,
      color_ar:    null,
      fuel_type:   fuelSlug,
      transmission: transSlug,
      body_type:   canonicalBodyType(data.bodyType),
      drive_type:  null,
      engine_size_l: null,
      doors:       null,
      seats:       data.seats || null,
      seller_type: 'certified',  // Soum is a managed marketplace with inspection
      photos:      data.imgs,
      description_ar: null,
      description: data.desc || null,
    },
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
;(async () => {
  log(`start (${LIMIT ? `limit=${LIMIT}` : 'full'}${INCREMENTAL ? ', incremental' : ''})`)
  const t0 = Date.now()
  const writer = new RawWriter({ source: 'soum' })

  let skipSet = new Set()
  if (INCREMENTAL) {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const { data } = await writer.sb.from('raw_listings').select('source_id').eq('source', 'soum').gte('scraped_at', since)
    skipSet = new Set((data ?? []).map(r => r.source_id))
    log(`incremental: ${skipSet.size} recent rows will be skipped`)
  }

  const { browser } = await launchBrowser({ headless: !HEADED })
  const categories = await discoverCategories(browser)

  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US', ignoreHTTPSErrors: true,
  })
  const page = await ctx.newPage()

  const allUrls = new Set()
  for (const cat of categories) {
    if (LIMIT && allUrls.size >= LIMIT * 2) break
    const urls = await collectProductUrlsFromCategory(page, cat)
    for (const u of urls) allUrls.add(u)
    log(`  category ${cat.replace('https://soum.sa', '')}: +${urls.length} (total uniq ${allUrls.size})`)
    await sleep(600)
  }
  log(`total unique product URLs: ${allUrls.size}`)

  let successes = 0
  let processed = 0
  for (const url of allUrls) {
    if (LIMIT && successes >= LIMIT) break
    const id = url.match(PRODUCT_ID_RE)?.[1]
    if (skipSet.has(id)) { processed++; continue }
    processed++
    const r = await extractListing(page, url)
    if (r) {
      await writer.add(r)
      successes++
      if (successes % 25 === 0) log(`  scraped ${successes}/${allUrls.size}`)
    }
    await sleep(700)
  }

  await writer.close()
  await browser.close()
  const dt = ((Date.now() - t0) / 1000).toFixed(1)
  log(`done — ${successes} success / ${processed} processed / ${allUrls.size} discovered in ${dt}s`)
  log(`raw_writer totals: ${JSON.stringify(writer.totals)}`)
})().catch(e => { console.error(e); process.exit(1) })
