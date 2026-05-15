'use strict'
// scripts/scrapers/soum.js — soum.sa (Tier 1)
//
// IMPORTANT: Soum's `/en/cars` UI hub is broken (redirects to homepage when
// accessed directly without click navigation). We bypass that by enumerating
// product URLs from the public sitemap index at /api/sitemap.
//
// Phase 1: pull all sub-sitemaps, filter to car URLs (slug contains
//          `-NNNNN-NNNNNkm-YYYY-bodytype`).
// Phase 2: for each car URL, scrape the product page DOM.

const { launchBrowser } = require('./_shared/playwright')
const { RawWriter }     = require('./_shared/raw-writer')
const { fetchOnce }     = require('./_shared/http')

const argv = process.argv.slice(2)
const arg  = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
const flag = (n) => argv.includes(n)
const LIMIT       = arg('--limit') ? parseInt(arg('--limit'), 10) : null
const HEADED      = flag('--headed')
const INCREMENTAL = flag('--incremental')

const PAGE_TIMEOUT = 30000
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const log = (...a) => process.stderr.write(`[soum] ${a.join(' ')}\n`)

const PRODUCT_ID_RE = /([0-9a-f]{24})/
const CAR_SLUG_RE   = /-\d+-\d+km-\d{4}-(sedan|suv|hatchback|coupe|pickup|van|wagon|sport-truck|crossover)/i

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
  if (t.includes('suv') || t.includes('crossover')) return 'suv'
  if (t.includes('pickup') || t.includes('pick-up') || t.includes('sport-truck')) return 'pickup'
  if (t.includes('van') || t.includes('mpv')) return 'van'
  if (t.includes('coupe')) return 'coupe'
  if (t.includes('hatchback')) return 'hatchback'
  if (t.includes('wagon') || t.includes('estate')) return 'wagon'
  if (t.includes('sedan') || t.includes('saloon')) return 'sedan'
  return null
}

// Extract make/year/body_type/mileage_range from a sitemap slug.
function parseCarSlug (url) {
  // Soum slugs come in two shapes:
  //   /product/{model-slug}-{km-range}-{year}-{body}-{id}-{arabic-suffix}
  //   /product/{id}-{model-slug}-{km-range}-{year}-{body}
  const decoded = decodeURIComponent(url)
  const m = decoded.match(/([\w-]+?)-(\d+)-(\d+)km-(\d{4})-(\w+)(?:-([0-9a-f]{24}))?/i)
  if (!m) return null
  return {
    model_slug_raw: m[1],
    km_low: parseInt(m[2]),
    km_high: parseInt(m[3]),
    year: parseInt(m[4]),
    body_raw: m[5],
    id_from_slug: m[6] || null,
  }
}

// ── Phase 1: pull all car URLs from sitemap ─────────────────────────────────
async function discoverCarUrls () {
  // 1. Top-level sitemap index
  const idx = await fetchOnce('https://soum.sa/api/sitemap')
  const subSitemaps = [...idx.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
  log(`sitemap index: ${subSitemaps.length} sub-sitemaps`)

  const cars = new Map()   // id → url

  // 2. For each product sitemap, pull URLs and filter to cars
  for (const sm of subSitemaps) {
    if (!sm.includes('/products/')) continue
    // Convert public URL → api URL (the redirect path)
    const apiUrl = sm.replace('https://soum.sa/products/', 'https://soum.sa/api/sitemap/products/').replace('/sitemap.xml', '')
    try {
      const r = await fetchOnce(apiUrl)
      const urls = [...r.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
      let added = 0
      for (const u of urls) {
        if (!CAR_SLUG_RE.test(u)) continue
        const idMatch = u.match(PRODUCT_ID_RE)
        if (!idMatch) continue
        const id = idMatch[1]
        if (!cars.has(id)) { cars.set(id, u); added++ }
      }
      log(`  ${sm.split('/').slice(-3)[0]}: +${added} cars (total ${cars.size})`)
    } catch (e) {
      log(`  sitemap ${sm} err: ${e.message?.slice(0, 60)}`)
    }
    await sleep(400)
  }
  return [...cars.entries()].map(([id, url]) => ({ id, url }))
}

// ── Phase 2: per-listing detail extraction ─────────────────────────────────
async function extractListing (page, url, id, slugInfo) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT })
    await sleep(3500)
  } catch (e) {
    return null
  }
  // If redirected away from product/, listing is gone.
  if (!page.url().includes('/product/')) return null

  const data = await page.evaluate(() => {
    const text = document.body?.innerText || ''
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
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
    let color = null, fuel = null, transmission = null, city = null, seats = null
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(Color|Body Color|Exterior Color|Fuel Type|Transmission|City|Location|Region|Seats|Seating Capacity|Number of Seats):?\s*(.*)$/i)
      if (m) {
        const key = m[1].toLowerCase()
        const val = (m[2] || lines[i + 1] || '').trim()
        if (key.includes('color') && !color) color = val
        else if (key.includes('fuel') && !fuel) fuel = val
        else if (key.includes('transmission') && !transmission) transmission = val
        else if ((key.includes('city') || key.includes('location') || key.includes('region')) && !city) city = val
        else if (key.includes('seat') && !seats) seats = parseInt(val)
      }
    }
    const imgs = [...new Set([...document.querySelectorAll('img[src*="cdn.soum.sa"]')]
      .map(img => img.src.replace(/\?.*$/, ''))
      .filter(u => u.includes('/listings/')))].slice(0, 12)
    const h1 = document.querySelector('h1')?.textContent?.trim() ?? null

    return { variantLine, model, mileageRaw, year, bodyType, price, make, color, fuel, transmission, city, seats, imgs, h1 }
  }).catch(() => null)

  if (!data) return null

  // Fallback to sitemap slug if extraction missed fields.
  const year = data.year ?? slugInfo?.year ?? null
  const mileage = parseMileageRange(data.mileageRaw) ?? (slugInfo ? Math.round((slugInfo.km_low + slugInfo.km_high) / 2) : null)
  const bodyType = canonicalBodyType(data.bodyType) ?? canonicalBodyType(slugInfo?.body_raw)
  if (!data.price && !data.model) return null

  return {
    source_id: id,
    source_url: url,
    structured_data: {
      source_id: id,
      source_url: url,
      title: data.h1 || data.variantLine || `${data.make ?? ''} ${data.model ?? slugInfo?.model_slug_raw ?? ''} ${year ?? ''}`.trim(),
      make_en: data.make,
      make_ar: null,
      model_en: data.model || slugInfo?.model_slug_raw,
      model_ar: null,
      trim: null,
      year,
      condition: 'used',
      price_sar: data.price,
      mileage_km: mileage,
      city_en: data.city || null,
      city_ar: null,
      color_en: data.color || null,
      color_ar: null,
      fuel_type: data.fuel ? data.fuel.toLowerCase() : null,
      transmission: data.transmission
        ? (data.transmission.toLowerCase().includes('auto') ? 'automatic'
           : data.transmission.toLowerCase().includes('manual') ? 'manual' : null)
        : null,
      body_type: bodyType,
      drive_type: null,
      engine_size_l: null,
      doors: null,
      seats: data.seats || null,
      seller_type: 'certified',
      photos: data.imgs,
      description_ar: null,
    },
  }
}

;(async () => {
  log(`start (${LIMIT ? `limit=${LIMIT}` : 'full'})`)
  const t0 = Date.now()
  const writer = new RawWriter({ source: 'soum' })

  let skipSet = new Set()
  if (INCREMENTAL) {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const { data } = await writer.sb.from('raw_listings').select('source_id').eq('source', 'soum').gte('scraped_at', since)
    skipSet = new Set((data ?? []).map(r => r.source_id))
    log(`incremental: ${skipSet.size} recent rows skipped`)
  }

  const carEntries = await discoverCarUrls()
  log(`Phase 1 done — ${carEntries.length} car URLs discovered`)

  const { browser } = await launchBrowser({ headless: !HEADED })
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US', ignoreHTTPSErrors: true,
  })
  const page = await ctx.newPage()

  let successes = 0
  for (const { id, url } of carEntries) {
    if (LIMIT && successes >= LIMIT) break
    if (skipSet.has(id)) continue
    const slug = parseCarSlug(url)
    const r = await extractListing(page, url, id, slug)
    if (r) {
      await writer.add(r)
      successes++
      if (successes % 25 === 0) log(`  scraped ${successes}/${carEntries.length}`)
    }
    await sleep(700)
  }

  await ctx.close()
  await writer.close()
  await browser.close()
  log(`done — ${successes}/${carEntries.length} in ${((Date.now()-t0)/1000).toFixed(1)}s`)
  log(`raw_writer totals: ${JSON.stringify(writer.totals)}`)
})().catch(e => { console.error(e); process.exit(1) })
