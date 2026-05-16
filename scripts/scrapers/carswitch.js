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

// CarSwitch detail URLs use SINGULAR `used-car`:
//   /{city}/used-car/{make}/{model}/{year}/{id}
// Discovery: enumerate per-make pages (each shows ~24 cards), plus per-city
// and the global /search route. Pagination may not exist (small marketplace).
const MAKES = [
  'toyota','hyundai','kia','nissan','gmc','chevrolet','ford','lexus','honda',
  'mitsubishi','bmw','mercedes-benz','jeep','land-rover','audi','dodge',
  'cadillac','infiniti','genesis','mazda','haval','mg','geely','renault',
  'volkswagen','porsche','peugeot','suzuki','subaru','volvo','jetour',
  'changan','byd','dongfeng','ram','isuzu','jaguar','mini','lincoln',
]
const CITIES = ['saudi','riyadh','jeddah','dammam','al-khobar','mecca','medina','tabuk']

async function harvestPage (page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT })
    await sleep(4500)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {})
    await sleep(1500)
    return await page.evaluate(() =>
      [...new Set([...document.querySelectorAll('a[href*="/used-car/"]')]
        .map(a => a.href)
        // Detail URLs: /{city}/used-car/{make}/{model}/{year}/{id}
        .filter(h => /\/used-car\/[\w-]+\/[\w-]+\/\d{4}\/\d+/i.test(h)))]
    )
  } catch (e) {
    return []
  }
}

async function collectUrls (browser) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US', ignoreHTTPSErrors: true,
  })
  const page = await ctx.newPage()
  const urls = new Map()

  async function sweep (label, routes) {
    for (const url of routes) {
      if (LIMIT && urls.size >= LIMIT * 2) return
      const items = await harvestPage(page, url)
      let added = 0
      for (const u of items) {
        const m = u.match(/\/(\d+)\/?$/)
        if (!m) continue
        const id = m[1]
        if (!urls.has(id)) { urls.set(id, u.split('?')[0]); added++ }
      }
      log(`${label} ${url.replace('https://ksa.carswitch.com/en', '')}: +${added} (total ${urls.size})`)
      await rndDelay()
    }
  }

  // 1. Global search + per-city search routes.
  const searchRoutes = CITIES.map(c => `https://ksa.carswitch.com/en/${c}/used-cars/search`)
  await sweep('search', searchRoutes)
  // 2. Per-make routes (the /saudi/used-cars/{make} pages show the make's full inventory).
  const makeRoutes = MAKES.map(m => `https://ksa.carswitch.com/en/saudi/used-cars/${m}`)
  await sweep('make', makeRoutes)

  await ctx.close()
  return [...urls.entries()].map(([id, url]) => ({ id, url }))
}

// CarSwitch URL → { city, make, model, year, id }
function parseDetailUrl (url) {
  const m = url.match(/\/en\/([\w-]+)\/used-car\/([\w-]+)\/([\w-]+)\/(\d{4})\/(\d+)/)
  if (!m) return null
  return { city: m[1], make: m[2], model: m[3], year: parseInt(m[4]), id: m[5] }
}

// ── Phase 2: detail page extraction ────────────────────────────────────────
// CarSwitch listing pages render specs as adjacent "label\nvalue" pairs
// (not "Label: value"). The URL path holds canonical city/make/model/year/id.
async function extractListing (page, url, id) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT })
    await sleep(4500)
  } catch {
    return null
  }
  const urlMeta = parseDetailUrl(url)

  const data = await page.evaluate(() => {
    const text = (document.body.innerText || '')
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

    function valNext (labels) {
      for (const lbl of labels) {
        const idx = lines.indexOf(lbl)
        if (idx >= 0 && lines[idx + 1]) return lines[idx + 1]
      }
      return null
    }

    // Price: "SAR XX,XXX" pattern — pick the FIRST occurrence (cash/current price).
    let price = null
    for (const ln of lines) {
      const m = ln.match(/^SAR\s+([\d,]+)$/)
      if (m) { price = parseInt(m[1].replace(/,/g, '')) || null; break }
    }
    if (!price) {
      const m = text.match(/SAR\s*([\d,]{4,})/)
      if (m) price = parseInt(m[1].replace(/,/g, '')) || null
    }

    // Mileage: line like "633 KM"
    let mileage = null
    for (const ln of lines) {
      const m = ln.match(/^(\d[\d,]*)\s*KM$/i)
      if (m) { mileage = parseInt(m[1].replace(/,/g, '')) || null; break }
    }

    // City: "Al Fayhaa, Jeddah" line — comma-separated, second part is city.
    let cityFromText = null
    for (const ln of lines) {
      const m = ln.match(/^[\w\s']+,\s*([A-Z][\w\s]+)$/)
      if (m && /Riyadh|Jeddah|Dammam|Khobar|Mecca|Medina|Abha|Taif|Tabuk|Qassim|Hail/i.test(ln)) {
        cityFromText = m[1].trim()
        break
      }
    }

    // Title: detect the line that combines make+model+engine; usually two lines
    // ABOVE the year line.
    let title = null
    for (let i = 0; i < lines.length; i++) {
      if (/^\d{4}$/.test(lines[i]) && lines[i - 1] && lines[i - 1].length > 5) {
        title = lines[i - 1]
        break
      }
    }
    if (!title) title = document.querySelector('h1')?.textContent?.trim() ?? null

    // Photos: CarSwitch ships listing photos in JSON-LD `image` array.
    // The cloudfront URLs are extensionless (e.g. /cars/used/images/original/<uuid>)
    // so the legacy <img src> + extension filter missed them entirely.
    const photos = (() => {
      const seen = new Set()
      const out = []
      for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          const j = JSON.parse(s.textContent || '')
          const imgs = Array.isArray(j.image) ? j.image
                     : (typeof j.image === 'string' ? [j.image] : [])
          for (const u of imgs) {
            if (typeof u !== 'string') continue
            if (seen.has(u)) continue
            seen.add(u)
            out.push(u)
            if (out.length >= 20) return out
          }
        } catch { /* skip non-JSON */ }
      }
      return out
    })()

    // Monthly installment
    const instMatch = text.match(/Installments:\s*\n?\s*SAR\s*([\d,]+)/i)
    const monthlyInstallment = instMatch ? parseInt(instMatch[1].replace(/,/g, '')) : null

    // External price label (if any badge shown)
    let labelText = null
    for (const ln of lines) {
      if (/^(Great|Good|Fair)\s*price$/i.test(ln) || /\d+\s*%\s*off/i.test(ln) || /^Price dropped$/i.test(ln)) {
        labelText = ln; break
      }
    }

    const trim = (() => {
      // Trim line often appears right after "Saudi specs" + flags
      const semiIdx = lines.findIndex(l => /^(Semi|Fully|Stripped)\s+Loaded$/i.test(l))
      if (semiIdx >= 0) return lines[semiIdx]
      return null
    })()

    return {
      title, price, mileage, cityFromText, photos, monthlyInstallment, labelText, trim,
      fuelRaw: valNext(['Fuel Type', 'Fuel']),
      transRaw: valNext(['Transmission']),
      driveRaw: valNext(['Drive Type']),
      bodyRaw: valNext(['Body Type', 'Body']),
      colorRaw: valNext(['Color', 'Exterior Color']),
      seatsRaw: valNext(['Seats']),
      doorsRaw: valNext(['Doors']),
      saudiSpecs: /saudi\s*specs?/i.test(text),
      loanAvailable: /\bloan\b|financing|installment/i.test(text),
      inspection: /inspection\s*report|inspected/i.test(text),
      firstOwner: /First owner:\s*Yes/i.test(text),
    }
  }).catch(() => null)

  if (!data || !data.price) return null

  return {
    source_id: id,
    source_url: url,
    structured_data: {
      source_id: id,
      source_url: url,
      title: data.title,
      make_en: urlMeta?.make ?? null,    make_ar: null,
      model_en: urlMeta?.model ?? null,  model_ar: null,
      trim: data.trim,
      year: urlMeta?.year ?? null,
      condition: 'used',
      price_sar: data.price,
      mileage_km: data.mileage && data.mileage > 0 ? data.mileage : null,
      city_en: data.cityFromText || urlMeta?.city || null,
      city_ar: null,
      color_en: data.colorRaw, color_ar: null,
      fuel_type: canonicalFuel(data.fuelRaw),
      transmission: canonicalTrans(data.transRaw),
      body_type: canonicalBody(data.bodyRaw),
      drive_type: data.driveRaw ? data.driveRaw.toLowerCase().replace(/\s+/g, '') : null,
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
      first_owner:         data.firstOwner,
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
