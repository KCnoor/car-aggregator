'use strict'
// Pre-baseline data quality audit per user spec (A-F).
// Reads all canonical listings, computes per-source field coverage, outliers,
// format consistency, cross-source duplicates, intra-source duplicates, and
// source bias on top (make, model, year) combos. Writes a markdown report.

const fs   = require('fs')
const path = require('path')

try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.replace(/^export\s+/, '').trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
    }
  }
} catch {}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const PAGE = 1000
const REPORT_DIR = path.join(__dirname, '..', 'reports')
fs.mkdirSync(REPORT_DIR, { recursive: true })

async function withRetry (fn, label, retries = 5) {
  let lastErr
  for (let i = 0; i < retries; i++) {
    try { return await fn() } catch (e) {
      lastErr = e
      await new Promise(r => setTimeout(r, 1500 * Math.pow(2, i)))
    }
  }
  throw lastErr
}

async function loadAllListings () {
  const all = []
  let offset = 0
  for (;;) {
    const { data } = await withRetry(() =>
      sb.from('listings')
        .select('id, source, source_id, source_url, source_quality_tier, make_slug, make_en, model_slug, model_en, year, price_sar, mileage_km, city_slug, city_en, body_type_slug, fuel_type_slug, transmission_slug, description_ar, photo_urls, condition, is_active, contact_for_price, red_flags')
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1)
        .then(r => { if (r.error) throw r.error; return r })
    , `listings page offset=${offset}`)
    if (!data || data.length === 0) break
    all.push(...data)
    process.stdout.write(`  loaded ${all.length}\r`)
    if (data.length < PAGE) break
    offset += data.length
  }
  process.stdout.write('\n')
  return all
}

function pct (n, d) { return d === 0 ? '0%' : ((n / d) * 100).toFixed(1) + '%' }

;(async () => {
  const lines = []
  const out = (...a) => { const s = a.join(' '); lines.push(s); console.log(s) }

  out(`# Data Quality Audit — Pre-Baseline`)
  out(`Generated: ${new Date().toISOString()}`)
  out('')

  out('Loading all listings…')
  const all = await loadAllListings()
  out(`Total listings: **${all.length}**`)
  out('')

  // Seats live in raw_listings.structured_data; pull a per-(source, source_id)
  // lookup so we can include seats coverage in the audit without a schema change.
  out('Loading seats coverage from raw_listings.structured_data…')
  const seatsBySrcId = new Map()
  {
    let offset = 0
    for (;;) {
      const { data } = await withRetry(() =>
        sb.from('raw_listings').select('source, source_id, structured_data')
          .order('id', { ascending: true })
          .range(offset, offset + PAGE - 1)
          .then(r => { if (r.error) throw r.error; return r })
      , `raw seats offset=${offset}`)
      if (!data || data.length === 0) break
      for (const r of data) {
        const s = r.structured_data
        if (s && s.seats != null) seatsBySrcId.set(`${r.source}|${r.source_id}`, s.seats)
      }
      if (data.length < PAGE) break
      offset += data.length
    }
  }
  out(`  ${seatsBySrcId.size} listings have seats in structured_data`)
  out('')
  // Attach seats to each listing row for coverage tally.
  for (const l of all) l._seats = seatsBySrcId.get(`${l.source}|${l.source_id}`) ?? null

  const SOURCES = [...new Set(all.map(l => l.source))].sort()

  // ── A. Field coverage by source ────────────────────────────────────────
  out('## A. Field coverage by source')
  out('')
  out('% of listings per source with a non-null value for each field.')
  out('')
  const FIELDS = ['price_sar', 'make_slug', 'model_slug', 'year', 'mileage_km', 'city_slug', 'body_type_slug', '_seats', 'description_ar', 'photo_urls', 'fuel_type_slug', 'transmission_slug']
  const FIELD_LABELS = { _seats: 'seats (from raw)' }
  const headers = ['source', 'rows', ...FIELDS.map(f => FIELD_LABELS[f] ?? f)]
  out('| ' + headers.join(' | ') + ' |')
  out('|' + headers.map(() => '---').join('|') + '|')
  for (const src of SOURCES) {
    const rows = all.filter(l => l.source === src)
    const counts = FIELDS.map(f => {
      if (f === 'photo_urls') return rows.filter(r => Array.isArray(r.photo_urls) && r.photo_urls.length > 0).length
      return rows.filter(r => r[f] != null && r[f] !== '').length
    })
    out('| ' + [src, rows.length, ...counts.map((c, i) => `${c} (${pct(c, rows.length)})`)].join(' | ') + ' |')
  }
  out('')

  // ── B. Outliers / red flags ────────────────────────────────────────────
  out('## B. Outliers and red flags')
  out('')
  const lowPrice    = all.filter(l => l.price_sar != null && l.price_sar < 5000)
  const highPrice   = all.filter(l => l.price_sar != null && l.price_sar > 3_000_000)
  const tinyMileage = all.filter(l => l.mileage_km != null && l.mileage_km < 100 && l.condition === 'used' && (l.year ?? 9999) < (new Date().getFullYear() - 2))
  const hugeMileage = all.filter(l => l.mileage_km != null && l.mileage_km > 500_000)
  const badYear     = all.filter(l => l.year != null && (l.year < 2000 || l.year > 2027))
  const noMake      = all.filter(l => l.make_slug == null)
  const noModel     = all.filter(l => l.model_slug == null)
  const noPrice     = all.filter(l => l.price_sar == null && l.is_active)
  out('| check | count | % of total |')
  out('|---|---:|---:|')
  out(`| price_sar < 5,000 (parse error suspect) | ${lowPrice.length} | ${pct(lowPrice.length, all.length)} |`)
  out(`| price_sar > 3,000,000 (verify legitimacy) | ${highPrice.length} | ${pct(highPrice.length, all.length)} |`)
  out(`| mileage_km < 100 on used car older than 2 yrs (shorthand bug) | ${tinyMileage.length} | ${pct(tinyMileage.length, all.length)} |`)
  out(`| mileage_km > 500,000 (high-mileage outlier) | ${hugeMileage.length} | ${pct(hugeMileage.length, all.length)} |`)
  out(`| year < 2000 or > 2027 (parse error) | ${badYear.length} | ${pct(badYear.length, all.length)} |`)
  out(`| make_slug NULL (can't bucket → unscoreable) | ${noMake.length} | ${pct(noMake.length, all.length)} |`)
  out(`| model_slug NULL (can't bucket) | ${noModel.length} | ${pct(noModel.length, all.length)} |`)
  out(`| price_sar NULL on active listing | ${noPrice.length} | ${pct(noPrice.length, all.length)} |`)
  out('')

  out('Top sources by null-make_slug count:')
  const noMakeBySrc = {}
  for (const r of noMake) noMakeBySrc[r.source] = (noMakeBySrc[r.source] ?? 0) + 1
  out('')
  out('| source | null make_slug |')
  out('|---|---:|')
  for (const [s, c] of Object.entries(noMakeBySrc).sort((a, b) => b[1] - a[1])) {
    const total = all.filter(l => l.source === s).length
    out(`| ${s} | ${c} (${pct(c, total)}) |`)
  }
  out('')

  out('Sample of price < 5,000 (first 10):')
  out('| source | id | year | make/model | price | mileage |')
  out('|---|---|---:|---|---:|---:|')
  for (const r of lowPrice.slice(0, 10)) {
    out(`| ${r.source} | ${r.source_id ?? r.id.slice(0, 6)} | ${r.year ?? '—'} | ${r.make_slug ?? '?'}/${r.model_slug ?? '?'} | ${r.price_sar} | ${r.mileage_km ?? '—'} |`)
  }
  out('')

  // ── C. Format consistency ─────────────────────────────────────────────
  out('## C. Format consistency')
  out('')
  out('### Distinct fuel_type_slug values:')
  const fuelDist = {}
  for (const l of all) if (l.fuel_type_slug) fuelDist[l.fuel_type_slug] = (fuelDist[l.fuel_type_slug] ?? 0) + 1
  for (const [v, c] of Object.entries(fuelDist).sort((a, b) => b[1] - a[1])) out(`  - \`${v}\`: ${c}`)
  out('')
  out('### Distinct transmission_slug values:')
  const transDist = {}
  for (const l of all) if (l.transmission_slug) transDist[l.transmission_slug] = (transDist[l.transmission_slug] ?? 0) + 1
  for (const [v, c] of Object.entries(transDist).sort((a, b) => b[1] - a[1])) out(`  - \`${v}\`: ${c}`)
  out('')
  out('### Distinct body_type_slug values:')
  const bodyDist = {}
  for (const l of all) if (l.body_type_slug) bodyDist[l.body_type_slug] = (bodyDist[l.body_type_slug] ?? 0) + 1
  for (const [v, c] of Object.entries(bodyDist).sort((a, b) => b[1] - a[1])) out(`  - \`${v}\`: ${c}`)
  out('')

  out('### Make_slug count by source:')
  out('')
  out('| source | distinct makes | top 3 makes by count |')
  out('|---|---:|---|')
  for (const src of SOURCES) {
    const rows = all.filter(l => l.source === src && l.make_slug)
    const m = {}
    for (const r of rows) m[r.make_slug] = (m[r.make_slug] ?? 0) + 1
    const top3 = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([k, v]) => `${k} (${v})`).join(', ')
    out(`| ${src} | ${Object.keys(m).length} | ${top3} |`)
  }
  out('')

  // ── D. Cross-source duplicate detection ────────────────────────────────
  out('## D. Cross-source duplicate detection')
  out('')
  out('Grouped by (make_slug, model_slug, year, mileage_5k_bucket, price_2k_bucket). Listings in the same bucket from different sources are likely the same car.')
  out('')
  const bucketGroups = new Map()
  for (const l of all) {
    if (!l.make_slug || !l.model_slug || !l.year || !l.price_sar) continue
    const mileBucket = l.mileage_km != null ? Math.floor(l.mileage_km / 5000) * 5000 : 'null'
    const priceBucket = Math.floor(l.price_sar / 2000) * 2000
    const key = `${l.make_slug}|${l.model_slug}|${l.year}|${mileBucket}|${priceBucket}`
    if (!bucketGroups.has(key)) bucketGroups.set(key, [])
    bucketGroups.get(key).push(l)
  }
  const multiSource = [...bucketGroups.values()].filter(g => new Set(g.map(l => l.source)).size >= 2)
  const triSource   = multiSource.filter(g => new Set(g.map(l => l.source)).size >= 3)
  out(`- Total bucket groups: ${bucketGroups.size}`)
  out(`- Buckets with listings from **2+ sources**: ${multiSource.length} (~${multiSource.reduce((s, g) => s + g.length, 0)} listings involved)`)
  out(`- Buckets with listings from **3+ sources**: ${triSource.length}`)
  out('')

  // Cross-source pair frequencies
  out('### Top source pairs that share buckets:')
  out('')
  const pairCounts = {}
  for (const g of multiSource) {
    const srcs = [...new Set(g.map(l => l.source))].sort()
    for (let i = 0; i < srcs.length; i++) {
      for (let j = i + 1; j < srcs.length; j++) {
        const k = `${srcs[i]} + ${srcs[j]}`
        pairCounts[k] = (pairCounts[k] ?? 0) + 1
      }
    }
  }
  out('| source pair | shared buckets |')
  out('|---|---:|')
  for (const [k, v] of Object.entries(pairCounts).sort((a, b) => b[1] - a[1]).slice(0, 15)) out(`| ${k} | ${v} |`)
  out('')

  // Sample of 3+ source dupes
  out('### Sample 3+-source dupes (first 5):')
  for (const g of triSource.slice(0, 5)) {
    out('')
    out(`- **${g[0].make_slug}/${g[0].model_slug}** ${g[0].year} | ~${Math.floor((g[0].mileage_km ?? 0) / 1000)}k km | ~${Math.floor(g[0].price_sar / 1000)}k SAR`)
    for (const l of g) out(`  - ${l.source}: id=${l.source_id ?? l.id.slice(0, 6)} price=${l.price_sar} mileage=${l.mileage_km ?? '—'}`)
  }
  out('')

  // ── E. Intra-source duplicate detection ────────────────────────────────
  out('## E. Intra-source duplicate detection')
  out('')
  out('Two checks per source: (1) repeat source_id (hard dupe), (2) listings within same source that match on (make, model, year, mileage_5k, price_2k) ⇒ likely duplicated upload.')
  out('')
  out('| source | rows | repeat source_id | intra-bucket dupes (groups > 1) | dupe rate |')
  out('|---|---:|---:|---:|---:|')
  for (const src of SOURCES) {
    const rows = all.filter(l => l.source === src)
    const sidCounts = {}
    for (const r of rows) if (r.source_id) sidCounts[r.source_id] = (sidCounts[r.source_id] ?? 0) + 1
    const repeatSids = Object.values(sidCounts).filter(c => c > 1).length
    const buckets = {}
    for (const r of rows) {
      if (!r.make_slug || !r.model_slug || !r.year || !r.price_sar) continue
      const mb = r.mileage_km != null ? Math.floor(r.mileage_km / 5000) * 5000 : 'null'
      const pb = Math.floor(r.price_sar / 2000) * 2000
      const k = `${r.make_slug}|${r.model_slug}|${r.year}|${mb}|${pb}`
      buckets[k] = (buckets[k] ?? 0) + 1
    }
    const dupGroups = Object.values(buckets).filter(c => c > 1)
    const dupRowCount = dupGroups.reduce((s, c) => s + (c - 1), 0)
    out(`| ${src} | ${rows.length} | ${repeatSids} | ${dupGroups.length} | ${pct(dupRowCount, rows.length)} |`)
  }
  out('')

  // ── F. Source bias on top (make, model, year) ──────────────────────────
  out('## F. Source bias check')
  out('')
  out('Top 5 (make, model, year) combinations: median price by source.')
  out('')
  const groupKey = (l) => `${l.make_slug}|${l.model_slug}|${l.year}`
  const groups = {}
  for (const l of all) {
    if (!l.make_slug || !l.model_slug || !l.year || !l.price_sar) continue
    const k = groupKey(l)
    if (!groups[k]) groups[k] = []
    groups[k].push(l)
  }
  const topGroups = Object.entries(groups).sort((a, b) => b[1].length - a[1].length).slice(0, 8)
  for (const [k, g] of topGroups) {
    const [m, mo, y] = k.split('|')
    out(`### ${m}/${mo} ${y} (${g.length} listings)`)
    out('')
    const bySrc = {}
    for (const l of g) {
      if (!bySrc[l.source]) bySrc[l.source] = []
      bySrc[l.source].push(l.price_sar)
    }
    out('| source | n | median | p25 | p75 |')
    out('|---|---:|---:|---:|---:|')
    for (const [src, prices] of Object.entries(bySrc).sort((a, b) => b[1].length - a[1].length)) {
      const sorted = [...prices].sort((a, b) => a - b)
      const med = sorted[Math.floor(sorted.length / 2)]
      const p25 = sorted[Math.floor(sorted.length * 0.25)]
      const p75 = sorted[Math.floor(sorted.length * 0.75)]
      out(`| ${src} | ${prices.length} | ${med?.toLocaleString()} | ${p25?.toLocaleString()} | ${p75?.toLocaleString()} |`)
    }
    out('')
  }

  // Save report
  const reportPath = path.join(REPORT_DIR, `data-quality-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.md`)
  fs.writeFileSync(reportPath, lines.join('\n'))
  console.log(`\nReport saved to: ${reportPath}`)
})().catch(e => { console.error(e); process.exit(1) })
