'use strict'
// scripts/scrapers/gogomotor.js — api.gogomotor.com REST scrape (Tier 2)
// JSON API, no Playwright needed. Paginates through `total` results.

const https = require('https')
const { RawWriter } = require('./_shared/raw-writer')

const argv = process.argv.slice(2)
const arg  = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
const flag = (n) => argv.includes(n)
const LIMIT       = arg('--limit') ? parseInt(arg('--limit'), 10) : null
const INCREMENTAL = flag('--incremental')

const log = (...a) => process.stderr.write(`[gogo] ${a.join(' ')}\n`)
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const IMG_BASE = 'https://img.gogomotor.com/assets/listing'
const CITY_MAP = {
  '1': 'Riyadh', '2': 'Jeddah', '3': 'Dammam',
  '3299': 'Makkah', '3302': 'Madinah', '3307': 'Khobar',
  '3309': 'Taif', '3312': 'Abha', '3317': 'Tabuk',
}
const SELECT_FIELDS = [
  'vehiclelistingid','defaultwebimageurl','askingprice','manufactureyear',
  'vehiclemake','vehiclemodel','vehiclemakekey','vehiclemodelkey',
  'spec','fueltypeid','fueltype','transmissionid','transmission',
  'ownership','mileage','cityid','issold','isactive','listingsummary',
  'bodytypeid','exteriorcolorid','specregionid','listeddate','ispremium',
  'seatcount','doorcount','bodytype','exteriorcolor',
]

function apiPost (body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const req = https.request({
      hostname: 'api.gogomotor.com',
      path: '/backend-api/opensearch/search',
      method: 'POST',
      rejectUnauthorized: false,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'https://www.gogomotor.com',
        'Referer': 'https://www.gogomotor.com/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } })
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

function canonicalFuel (raw) {
  if (!raw) return null
  const s = String(raw).toLowerCase()
  if (s.includes('petrol') || s.includes('gasoline')) return 'petrol'
  if (s.includes('diesel'))                            return 'diesel'
  if (s.includes('hybrid'))                            return 'hybrid'
  if (s.includes('electric') || s.includes('ev'))      return 'electric'
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
  if (s.includes('pickup') || s.includes('pick-up')) return 'pickup'
  if (s.includes('van') || s.includes('mpv'))        return 'van'
  if (s.includes('coupe'))                           return 'coupe'
  if (s.includes('hatch'))                           return 'hatchback'
  if (s.includes('wagon'))                           return 'wagon'
  if (s.includes('sedan') || s.includes('saloon'))   return 'sedan'
  return null
}

;(async () => {
  log(`start (${LIMIT ? `limit=${LIMIT}` : 'full'})`)
  const t0 = Date.now()
  const writer = new RawWriter({ source: 'gogomotor' })

  let skipSet = new Set()
  if (INCREMENTAL) {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const { data } = await writer.sb.from('raw_listings').select('source_id').eq('source', 'gogomotor').gte('scraped_at', since)
    skipSet = new Set((data ?? []).map(r => r.source_id))
    log(`incremental: ${skipSet.size} recent rows skipped`)
  }

  const PAGE_SIZE = 100
  let page = 1
  let total = Infinity
  let successes = 0
  let stop = false

  while (!stop && (page - 1) * PAGE_SIZE < total) {
    if (LIMIT && successes >= LIMIT) break
    let resp
    try {
      resp = await apiPost({
        languageID: 1,
        size: PAGE_SIZE,
        page,
        wildcard: '',
        filter: [{ term: { isnew: false } }, { term: { isoutlet: false } }],
        sort: [{ listeddate: { order: 'desc' } }],
        selectField: SELECT_FIELDS,
        searchFields: [],
        orFilter: [],
      })
    } catch (e) {
      log(`page ${page} error: ${e.message?.slice(0, 80)}`)
      await sleep(2000)
      if (page > 5) break
      page++; continue
    }
    const data = resp?.data
    if (!data?.results?.length) { log(`page ${page}: no results, stopping`); break }
    total = data.total
    log(`page ${page}/${Math.ceil(total/PAGE_SIZE)}: ${data.results.length} results (total ${total})`)

    let added = 0
    for (const raw of data.results) {
      if (LIMIT && successes >= LIMIT) { stop = true; break }
      if (raw.isactive !== 1 || raw.issold !== 0) continue
      if (!raw.askingprice || raw.askingprice <= 0) continue
      const id = String(raw.vehiclelistingid)
      if (skipSet.has(id)) continue
      const photo = raw.defaultwebimageurl ? `${IMG_BASE}/${id}/${raw.defaultwebimageurl}` : null
      await writer.add({
        source_id: id,
        source_url: `https://www.gogomotor.com/en/car-details/${id}`,
        structured_data: {
          source_id: id,
          source_url: `https://www.gogomotor.com/en/car-details/${id}`,
          title: `${raw.vehiclemake} ${raw.vehiclemodel} ${raw.manufactureyear}`,
          make_en: raw.vehiclemake, make_ar: null,
          model_en: raw.vehiclemodel, model_ar: null,
          trim: raw.spec,
          year: raw.manufactureyear ? parseInt(raw.manufactureyear) : null,
          condition: 'used',
          price_sar: parseInt(raw.askingprice),
          mileage_km: raw.mileage > 0 ? parseInt(raw.mileage) : null,
          city_en: CITY_MAP[String(raw.cityid)] || null, city_ar: null,
          color_en: raw.exteriorcolor || null, color_ar: null,
          fuel_type: canonicalFuel(raw.fueltype),
          transmission: canonicalTrans(raw.transmission),
          body_type: canonicalBody(raw.bodytype),
          drive_type: null,
          engine_size_l: null,
          doors: raw.doorcount ? parseInt(raw.doorcount) : null,
          seats: raw.seatcount ? parseInt(raw.seatcount) : null,
          seller_type: 'dealer',
          photos: photo ? [photo] : [],
          description_ar: null,
          description: raw.listingsummary?.length > 30 ? raw.listingsummary : null,
        },
      })
      successes++; added++
    }
    log(`  added ${added} (total so far: ${successes})`)
    page++
    await sleep(400)
  }

  await writer.close()
  log(`done — ${successes} success in ${((Date.now()-t0)/1000).toFixed(1)}s`)
  log(`raw_writer totals: ${JSON.stringify(writer.totals)}`)
})().catch(e => { console.error(e); process.exit(1) })
