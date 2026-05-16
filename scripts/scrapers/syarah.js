'use strict'
// scripts/scrapers/syarah.js — Syarah.com bulk scraper (Pipeline v2)
//
// Phase 1: discover all /cardetail/{slug}-{id} URLs by visiting
//          /autos/{make} pages and (when present) /autos/{make}/{model}
//          sub-pages. NO TARGET CAP — collects to exhaustion.
// Phase 2: for each URL, scrape the JSON-LD Car block, build a structured
//          row, and stream it into raw_listings via RawWriter.
//
// Usage:
//   node scripts/scrapers/syarah.js --limit 10          # canary
//   node scripts/scrapers/syarah.js                     # full
//   node scripts/scrapers/syarah.js --incremental       # skip already-fresh rows
//   node scripts/scrapers/syarah.js --headed            # debug, head-ful

const fs   = require('fs')
const path = require('path')
const { launchBrowser } = require('./_shared/playwright')
const { RawWriter }     = require('./_shared/raw-writer')

const argv = process.argv.slice(2)
const arg  = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
const flag = (n) => argv.includes(n)

const LIMIT          = arg('--limit')        ? parseInt(arg('--limit'), 10) : null
const HEADED         = flag('--headed')
const INCREMENTAL    = flag('--incremental')
const SKIP_DISCOVERY = flag('--skip-discovery')

// URL cache so we don't repeat the slow Phase 1 traversal between runs.
const URL_CACHE_FILE = path.join(__dirname, '_cache', 'syarah-urls.json')

// ── Discovery seed ──────────────────────────────────────────────────────────
// 26 makes from the legacy scraper, plus a sweep of common model paths to
// surface listings beyond the make landing page's first 12.
const BROWSE_MAKES = [
  'toyota','hyundai','kia','nissan','gmc','chevrolet','ford','lexus',
  'honda','mitsubishi','bmw','mercedes','jeep','land-rover','audi',
  'dodge','cadillac','infiniti','genesis','mazda','haval','mg',
  'geely','renault','volkswagen','porsche','peugeot','suzuki',
  'subaru','volvo','jetour','changan','baic','exeed','mahindra',
  'tata','ram','isuzu','jaguar','mini','lincoln','citroen','fiat',
]

const PAGE_TIMEOUT = 30000
const DELAY_MIN_MS = 800
const DELAY_MAX_MS = 2200
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const rndDelay = () => sleep(DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS))
const log = (...a) => process.stderr.write(`[syarah] ${a.join(' ')}\n`)

// ── Parsing helpers (lifted from legacy syarah-bulk.js extractor) ───────────
function parseInteger (raw) {
  if (raw == null) return null
  const n = parseInt(String(raw).replace(/[^0-9]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}
function parseMileage (raw) {
  if (raw == null) return null
  if (typeof raw === 'object' && raw.value != null) return parseInteger(raw.value)
  return parseInteger(raw)
}
function normFuel (raw) {
  if (!raw) return null
  const s = String(raw)
  if (/petrol|gasoline|benzin|بنزين/i.test(s)) return 'petrol'
  if (/diesel|ديزل/i.test(s))                  return 'diesel'
  if (/hybrid|هايبرد|هجين/i.test(s))           return 'hybrid'
  if (/electric|كهربائي/i.test(s))             return 'electric'
  return null
}
function normTransmission (raw) {
  if (!raw) return null
  if (/automatic|cvt|auto|أوتوماتيك|اوتو/i.test(String(raw))) return 'automatic'
  if (/manual|يدوي/i.test(String(raw)))                       return 'manual'
  return null
}
function normCondition (raw) {
  if (!raw) return null
  if (/used|UsedCondition|مستعمل/i.test(String(raw))) return 'used'
  if (/new|NewCondition|جديد/i.test(String(raw)))     return 'new'
  return null
}
function hiRes (url) { return url.replace(/\/0x\d+\//, '/0x480/') }

// Body-type detection from Arabic title + body text + model name fallback.
// Returns canonical English: sedan / suv / coupe / hatchback / pickup / van /
// wagon, or null. Syarah doesn't expose body_type in JSON-LD, so we infer.
//
// ASCII \b word boundaries don't fire on Arabic letters, so Arabic patterns
// are matched as plain substrings — false positives are unlikely because
// these tokens are body-type-specific Arabic vocabulary.
function detectBodyType (text, modelEn) {
  const t = String(text ?? '')
  // Order matters: most specific first.
  if (/\bsuv\b/i.test(t) || /جيب|كروس\s*[أا]وفر/.test(t))   return 'suv'
  if (/pickup|pick[\s-]?up/i.test(t) || /بيك\s*[أا]ب/.test(t)) return 'pickup'
  if (/\bvan\b/i.test(t) || /فان|ميني[\s-]?فان/.test(t))      return 'van'
  if (/coupe/i.test(t) || /كوبيه|كوبي/.test(t))               return 'coupe'
  if (/hatchback/i.test(t) || /هاتشباك|هاتش/.test(t))         return 'hatchback'
  if (/wagon/i.test(t) || /واغن|ستيشن/.test(t))               return 'wagon'
  if (/sedan/i.test(t) || /سيدان|صالون/.test(t))              return 'sedan'

  // Model-name fallback for high-volume canonical body types.
  // Conservative — only well-known one-to-one mappings. Null otherwise.
  const m = String(modelEn ?? '').toLowerCase()
  const SEDAN  = new Set(['camry','corolla','accord','civic','altima','sonata','elantra','sentra','azera','maxima','ts7','optima','k5','5-series','3-series','e-class','c-class','a4','a6','sonet','accord'])
  const SUV    = new Set(['land-cruiser','prado','fortuner','tahoe','suburban','yukon','escalade','grand-cherokee','wrangler','patrol','x-trail','pathfinder','armada','rav4','highlander','sequoia','expedition','explorer','edge','territory','tucson','santa-fe','sportage','sorento','x5','x6','x3','gx','rx','lx','q5','q7','q8','glc','gle','gls','range-rover'])
  const PICKUP = new Set(['hilux','tundra','tacoma','f-150','ram-1500','silverado','ranger','d-max','navara','frontier'])
  const VAN    = new Set(['haice','hiace','sienna','odyssey','starex','h-1'])
  const COUPE  = new Set(['mustang','challenger','charger','camaro','gt86','rx-7','rx-8','m4'])
  if (SEDAN.has(m))  return 'sedan'
  if (SUV.has(m))    return 'suv'
  if (PICKUP.has(m)) return 'pickup'
  if (VAN.has(m))    return 'van'
  if (COUPE.has(m))  return 'coupe'
  return null
}

// Some Syarah descriptions contain Arabic city names; map to canonical English.
function extractCityFromText (text) {
  const map = [
    ['Riyadh',  /الرياض|Riyadh/i],
    ['Jeddah',  /جدة|جده|Jeddah/i],
    ['Dammam',  /الدمام|Dammam/i],
    ['Khobar',  /الخبر|Khobar/i],
    ['Mecca',   /مكة|مكه|Mecca|Makkah/i],
    ['Medina',  /المدينة|المدينه|Medina|Madinah/i],
    ['Abha',    /أبها|Abha/i],
    ['Taif',    /الطائف|Taif/i],
    ['Tabuk',   /تبوك|Tabuk/i],
    ['Qassim',  /القصيم|بريدة|Qassim|Buraidah/i],
    ['Hail',    /حائل|Hail/i],
    ['Jubail',  /الجبيل|Jubail/i],
    ['Yanbu',   /ينبع|Yanbu/i],
    ['Najran',  /نجران|Najran/i],
  ]
  for (const [name, re] of map) if (re.test(text)) return name
  return null
}

// ── Phase 1: URL discovery via per-make pagination ─────────────────────────
// Syarah serves 12-16 listings per page on /autos/{make}?page=N. Iterate
// until two consecutive pages add zero new IDs. This is far more thorough
// (and faster) than crawling every model sub-page.
const PER_MAKE_MAX_PAGES = 100
const PER_MAKE_STALL_THRESHOLD = 2

async function collectUrls (browser, { limit }) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US', ignoreHTTPSErrors: true,
  })
  const page = await ctx.newPage()
  const seenById = new Map()

  for (const make of BROWSE_MAKES) {
    if (limit && seenById.size >= limit * 3) break
    let stall = 0
    for (let pg = 1; pg <= PER_MAKE_MAX_PAGES && stall < PER_MAKE_STALL_THRESHOLD; pg++) {
      const url = pg === 1 ? `https://syarah.com/autos/${make}` : `https://syarah.com/autos/${make}?page=${pg}`
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT })
        await sleep(3500 + Math.random() * 1500)   // give Vue/React time to render the grid
        const listings = await page.evaluate(() =>
          [...new Set([...document.querySelectorAll('a[href*="/cardetail/"]')]
            .map(a => a.href.split('#')[0]))]
        )
        const before = seenById.size
        for (const u of listings) {
          const m = u.match(/-(\d+)$/)
          if (m && !seenById.has(m[1])) seenById.set(m[1], u)
        }
        const added = seenById.size - before
        if (added === 0) stall++; else stall = 0
        if (pg === 1 || added > 0 || stall === PER_MAKE_STALL_THRESHOLD) {
          log(`  /autos/${make}?page=${pg}: +${added} (make total: ${[...seenById.keys()].length}; uniq overall: ${seenById.size})`)
        }
      } catch (e) {
        log(`  ERROR /autos/${make}?page=${pg}: ${e.message?.slice(0, 80)}`)
        stall++
      }
      await rndDelay()
    }
  }

  await ctx.close()
  log(`discovered ${seenById.size} unique listing URLs`)
  return [...seenById.entries()].map(([id, url]) => ({ id, url }))
}

// ── Phase 2: per-listing extraction ─────────────────────────────────────────
// Syarah's JSON-LD `brand.name` and `model.name` return localized Arabic
// regardless of Accept-Language. The URL slug, on the other hand, is always
// English-canonical (e.g. /cardetail/toyota-haice-used-301705). We use the
// URL slug for make/model_en and the JSON-LD for make/model_ar.
function parseMakeModelFromUrl (url) {
  // URL pattern: https://syarah.com/cardetail/{make}-{model-with-hyphens}-{condition}-{id}
  const m = url.match(/\/cardetail\/([^/]+?)-(new|used)-\d+\/?$/)
  if (!m) return { make_en: null, model_en: null }
  const slug = m[1]
  const parts = slug.split('-')
  if (parts.length < 2) return { make_en: parts[0], model_en: null }
  return { make_en: parts[0], model_en: parts.slice(1).join('-') }
}

// Try to wait for the Car JSON-LD block to appear. Returns true if found,
// false on timeout. Syarah hydrates this client-side; the 1.2s wait we used
// originally was too short.
async function waitForCarLd (page, timeoutMs = 12000) {
  try {
    await page.waitForFunction(() => {
      return [...document.querySelectorAll('script[type="application/ld+json"]')]
        .some(s => { try { return JSON.parse(s.textContent)['@type'] === 'Car' } catch { return false } })
    }, { timeout: timeoutMs })
    return true
  } catch {
    return false
  }
}

// HTML fallback parser — runs in the page context. Returns the same shape as
// the JSON-LD extractor but reading from the DOM. Used when the Car LD block
// fails to appear within the timeout (some listings hydrate late or use a
// different template).
async function extractFromHTML (page) {
  return await page.evaluate(() => {
    const text = document.body?.innerText ?? ''
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

    // Title: h1 (Arabic)
    const h1 = document.querySelector('h1')?.textContent?.trim() ?? null

    // Price: look for "XX,XXX ريال" pattern (Arabic for SAR)
    let price = null
    const priceMatch = text.match(/(\d{2,3}[,\d]{2,})\s*ريال/)
    if (priceMatch) price = parseInt(priceMatch[1].replace(/,/g, '')) || null
    // Some Syarah pages display tax-inclusive prices with explicit label
    if (!price) {
      const altMatch = text.match(/سعر[\s\S]{0,30}?(\d{2,3}[,\d]{2,})/)
      if (altMatch) price = parseInt(altMatch[1].replace(/,/g, '')) || null
    }

    // Spec table: pairs of "label\nvalue"
    const specs = {}
    const KEYS = [
      'الماركة','الموديل','سنة الصنع','الممشى','اللون الخارجي','اللون الداخلي',
      'سعة المحرك','نوع الوقود','الجير','عدد المقاعد','عدد الغمارات','عدد السليندرات',
      'نظام الدفع','الشكل','الفئة','المدينة','الحالة',
    ]
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i]
      if (KEYS.includes(ln) && lines[i + 1] && !KEYS.includes(lines[i + 1])) {
        specs[ln] = lines[i + 1]
      }
    }

    // Photos: Syarah CDN
    const photos = [...new Set([...document.querySelectorAll('img[src*="cdn.syarah.com"]')]
      .map(img => img.src.replace(/\/0x\d+\//, '/0x480/')))].slice(0, 30)

    // Description (sometimes inside a section labelled with these tokens)
    let description = null
    const descLabels = ['وصف السيارة', 'تفاصيل الإعلان', 'ملاحظات']
    for (let i = 0; i < lines.length; i++) {
      if (descLabels.includes(lines[i]) && lines[i + 1]) {
        description = lines.slice(i + 1, i + 4).join(' ').slice(0, 1200)
        break
      }
    }

    return { h1, price, specs, photos, description, bodyExcerpt: text.slice(0, 4000) }
  }).catch(() => null)
}

async function extractListing (page, url) {
  // First wait for the Car JSON-LD block to appear (up to 12s).
  const ldOk = await waitForCarLd(page, 12000)

  const raw = await page.evaluate(() => {
    const ldScripts = [...document.querySelectorAll('script[type="application/ld+json"]')]
    const ldObjects = ldScripts.map(s => { try { return JSON.parse(s.textContent) } catch { return null } }).filter(Boolean)
    const carLd = ldObjects.find(o => o['@type'] === 'Car') ?? null
    const bodyText = document.body.innerText ?? ''
    const priceMatch = bodyText.match(/(\d[\d,]{2,})\s*ريال/)
    const adNo = bodyText.match(/رقم الإعلان[:\s]*(\d+)/)?.[1] ?? null
    return {
      carLd,
      bodyText: bodyText.slice(0, 6000),
      priceHtml: priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : null,
      adNo,
    }
  })

  const m = url.match(/-(\d+)$/)
  const id = m?.[1] ?? raw.adNo
  if (!id) return null

  const ld = raw.carLd
  // HTML fallback when JSON-LD Car block never hydrates or is missing.
  if (!ld) {
    const html = await extractFromHTML(page)
    if (!html || !html.price) return null
    const urlSlug = parseMakeModelFromUrl(url)
    return {
      structured_data: {
        source_id: String(id),
        source_url: url.split('#')[0],
        title: html.h1,
        make_en: urlSlug.make_en,
        make_ar: html.specs['الماركة'] ?? null,
        model_en: urlSlug.model_en,
        model_ar: html.specs['الموديل'] ?? null,
        trim: html.specs['الفئة'] ?? null,
        year: html.specs['سنة الصنع'] ? parseInt(html.specs['سنة الصنع']) : null,
        condition: /used|مستعمل/i.test(html.specs['الحالة'] ?? '') ? 'used'
          : /new|جديد/i.test(html.specs['الحالة'] ?? '') ? 'new' : 'used',
        price_sar: html.price,
        mileage_km: html.specs['الممشى'] ? parseMileage(html.specs['الممشى']) : null,
        city_en: extractCityFromText(html.bodyExcerpt),
        city_ar: html.specs['المدينة'] ?? null,
        color_en: null,
        color_ar: html.specs['اللون الخارجي'] ?? null,
        color_interior_ar: html.specs['اللون الداخلي'] ?? null,
        fuel_type: normFuel(html.specs['نوع الوقود']),
        transmission: normTransmission(html.specs['الجير']),
        drive_type: null,
        body_type: detectBodyType(`${html.h1 ?? ''} ${html.bodyExcerpt}`, urlSlug.model_en),
        engine_size_l: html.specs['سعة المحرك']
          ? parseFloat(String(html.specs['سعة المحرك']).replace(/[^0-9.]/g, '')) || null
          : null,
        doors: html.specs['عدد الغمارات'] ? parseInt(html.specs['عدد الغمارات']) || null : null,
        seats: html.specs['عدد المقاعد'] ? parseInt(html.specs['عدد المقاعد']) || null : null,
        seller_type: 'dealer',
        photos: html.photos,
        description_ar: html.description,
        _parser: 'html_fallback',
      },
    }
  }

  const price       = parseInteger(ld?.offers?.price) ?? parseInteger(raw.priceHtml)
  const mileage     = parseMileage(ld?.mileageFromOdometer)
  const year        = ld?.vehicleModelDate ? parseInt(ld.vehicleModelDate) : null
  // ld.brand.name and ld.model.name return Arabic on Syarah; URL slug is English-canonical.
  const ldMakeAr    = ld?.brand?.name ?? (typeof ld?.brand === 'string' ? ld.brand : null)
  const ldModelAr   = typeof ld?.model === 'string' ? ld.model : (ld?.model?.name ?? null)
  const urlSlug     = parseMakeModelFromUrl(url)
  const trim        = ld?.vehicleConfiguration ?? null
  const fuel        = normFuel(ld?.vehicleEngine?.fuelType ?? raw.bodyText)
  const transmission = normTransmission(ld?.vehicleTransmission ?? raw.bodyText)
  const condition   = normCondition(ld?.itemCondition)
  const colorAr     = ld?.color ?? null     // Arabic
  const colorIntAr  = ld?.vehicleInteriorColor ?? null
  const photos      = Array.isArray(ld?.image) ? ld.image.map(hiRes) : (ld?.image ? [hiRes(ld.image)] : [])
  const driveRaw    = ld?.driveWheelConfiguration ?? null
  // Drive type often comes as a schema.org URL; canonicalise the suffix.
  const driveType = driveRaw && typeof driveRaw === 'string'
    ? driveRaw.replace(/^https?:\/\/schema\.org\//, '').replace(/DriveConfiguration$/, '').toLowerCase()
    : null
  const city        = extractCityFromText(raw.bodyText)
  const titleAr     = ld?.name?.replace(/\s*[-|].*$/, '').trim() ?? null
  const bodyType    = detectBodyType(`${titleAr ?? ''} ${raw.bodyText}`, urlSlug.model_en)
  const doors       = ld?.numberOfDoors ? parseInt(ld.numberOfDoors) : null
  const seats       = ld?.vehicleSeatingCapacity ? parseInt(ld.vehicleSeatingCapacity) : null
  const engineRaw   = ld?.vehicleEngine?.engineDisplacement?.value

  return {
    structured_data: {
      source_id: String(id),
      source_url: url.split('#')[0],
      title: titleAr,            // Arabic; English not exposed by Syarah
      make_en: urlSlug.make_en,   // 'toyota', 'hyundai', …
      make_ar: ldMakeAr,          // 'تويوتا', etc.
      model_en: urlSlug.model_en, // 'haice', 'corolla', …
      model_ar: ldModelAr,
      trim,
      year,
      condition: condition ?? 'used',
      price_sar: price,
      mileage_km: mileage,
      city_en: city,
      city_ar: null,              // extractCityFromText already returns English canonical
      color_ar: colorAr,
      color_en: null,             // Syarah doesn't expose English color names
      color_interior_ar: colorIntAr,
      fuel_type: fuel,
      transmission,
      drive_type: driveType,
      body_type: bodyType,
      engine_size_l: engineRaw ? parseFloat(engineRaw) : null,
      doors,
      seats,
      seller_type: 'dealer',
      photos,
      // Syarah dealer-curates: no free-form description, so red-flag detection
      // for these listings reads title + mileage only. Acceptable for Tier 1.
      description_ar: null,
    },
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
;(async () => {
  log(`start (${LIMIT ? `limit=${LIMIT}` : 'full'}${INCREMENTAL ? ', incremental' : ''})`)
  const t0 = Date.now()
  const writer = new RawWriter({ source: 'syarah' })

  const { browser, context } = await launchBrowser({ headless: !HEADED })

  // Pre-load already-scraped source_ids if incremental.
  let skipSet = new Set()
  if (INCREMENTAL) {
    log('incremental: checking raw_listings for recent scrapes…')
    const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000
    const since = new Date(Date.now() - SEVEN_DAYS_MS).toISOString()
    const { data } = await writer.sb
      .from('raw_listings')
      .select('source_id')
      .eq('source', 'syarah')
      .gte('scraped_at', since)
    skipSet = new Set((data ?? []).map(r => r.source_id))
    log(`  ${skipSet.size} recent rows will be skipped`)
  }

  let urls
  if (SKIP_DISCOVERY && fs.existsSync(URL_CACHE_FILE)) {
    urls = JSON.parse(fs.readFileSync(URL_CACHE_FILE, 'utf8'))
    log(`loaded ${urls.length} URLs from cache (--skip-discovery)`)
  } else {
    urls = await collectUrls(browser, { limit: LIMIT })
    try {
      fs.mkdirSync(path.dirname(URL_CACHE_FILE), { recursive: true })
      fs.writeFileSync(URL_CACHE_FILE, JSON.stringify(urls, null, 2))
      log(`cached ${urls.length} URLs to ${URL_CACHE_FILE}`)
    } catch (e) { log(`cache write failed: ${e.message}`) }
  }
  const targetUrls = LIMIT ? urls.slice(0, LIMIT * 2) : urls   // discovery overshoot, scrape until LIMIT successful

  await context.close()
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US', ignoreHTTPSErrors: true,
  })
  const page = await ctx.newPage()

  let successes = 0
  let processed = 0
  for (const { id, url } of targetUrls) {
    if (LIMIT && successes >= LIMIT) break
    if (skipSet.has(String(id))) { processed++; continue }
    processed++

    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT })
      const status = resp?.status() ?? 0
      if (status >= 400) {
        log(`  HTTP ${status} ${url.slice(-40)}`)
        await rndDelay()
        continue
      }
      await sleep(1200 + Math.random() * 600)
      const extracted = await extractListing(page, url)
      if (!extracted) { await rndDelay(); continue }

      await writer.add({
        source_id:        extracted.structured_data.source_id,
        source_url:       extracted.structured_data.source_url,
        structured_data:  extracted.structured_data,
        raw_html_or_json: null,   // not storing full HTML — body excerpt only
      })
      successes++
      if (successes % 25 === 0) log(`  scraped ${successes}/${targetUrls.length}`)
    } catch (e) {
      log(`  ERROR ${url.slice(-40)}: ${e.message?.slice(0, 80)}`)
    }
    await rndDelay()
  }

  await writer.close()
  await browser.close()
  const dt = ((Date.now() - t0) / 1000).toFixed(1)
  log(`done — ${successes} successes / ${processed} processed / ${urls.length} discovered in ${dt}s`)
  log(`raw_writer totals: ${JSON.stringify(writer.totals)}`)
})().catch(e => { console.error(e); process.exit(1) })
