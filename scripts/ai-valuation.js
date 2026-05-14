'use strict'
// scripts/ai-valuation.js
// AI pricing engine: calls Claude Haiku for listings.
// Cache keyed by (make_slug|model_slug|year|mileage_bucket|city_slug).
// Red-flag detection is done client-side on the description (no API call needed).
// Run: node scripts/ai-valuation.js           — score only unscored listings
//      node scripts/ai-valuation.js --all     — re-score every priced listing
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const fs   = require('fs')
const path = require('path')

// Load env
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.replace(/^export\s+/, '').trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
    }
  }
} catch { /* shell env takes priority */ }

if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const harajEnv = path.join(__dirname, '..', '..', 'haraj-scraper', '.env')
    if (fs.existsSync(harajEnv)) {
      for (const line of fs.readFileSync(harajEnv, 'utf8').split(/\r?\n/)) {
        const m = line.replace(/^export\s+/, '').trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
        if (m && m[1] === 'ANTHROPIC_API_KEY' && !process.env.ANTHROPIC_API_KEY)
          process.env.ANTHROPIC_API_KEY = m[2].replace(/^['"]|['"]$/g, '').trim()
      }
    }
  } catch { /* ignore */ }
}

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jmfoeziomchpwanuziqm.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY    = process.env.ANTHROPIC_API_KEY
const FORCE_ALL        = process.argv.includes('--all')

if (!SERVICE_ROLE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
if (!ANTHROPIC_KEY)    { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1) }

const https = require('https')
const { createClient } = require('@supabase/supabase-js')

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function callClaude(prompt, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const result = await new Promise((resolve, reject) => {
        const body = JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 250,
          messages: [{ role: 'user', content: prompt }],
        })
        const req = https.request({
          hostname: 'api.anthropic.com',
          path: '/v1/messages',
          method: 'POST',
          rejectUnauthorized: false,
          timeout: 30000,
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Length': Buffer.byteLength(body),
          },
        }, (res) => {
          let data = ''
          res.on('data', c => data += c)
          res.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(new Error(`JSON parse failed (status ${res.statusCode}): ${data.slice(0, 100)}`)) } })
        })
        req.on('timeout', () => { req.destroy(new Error('Request timed out')) })
        req.on('error', reject)
        req.write(body)
        req.end()
      })
      return result
    } catch (e) {
      if (attempt < retries - 1) {
        await sleep(2000 * (attempt + 1))
      } else {
        throw e
      }
    }
  }
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// ── Cache ─────────────────────────────────────────────────────────────────────
const CACHE_FILE = path.join(__dirname, 'ai-valuation-cache.json')
let cache = {}
try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) } catch { cache = {} }
function saveCache() { fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2)) }

// ── Red flag detection (client-side, no API needed) ───────────────────────────
const RED_FLAG_PATTERNS = [
  { re: /حادث|مصدوم|تصادم/,                    label: 'accident'             },
  { re: /airbag|air\s*bag/i,                    label: 'airbag_deployed'      },
  { re: /side\s*impact|جانبي/i,                 label: 'side_impact'          },
  { re: /محرك\s*معاد|محرك\s*مجدد|overhauled/i, label: 'engine_overhauled'    },
  { re: /استمارة\s*منتهية?|expired\s*reg/i,     label: 'expired_registration' },
  { re: /تأمين\s*منتهي|expired\s*ins/i,         label: 'expired_insurance'    },
  { re: /وفاة|توفي|متوفي|ورث|ميراث|inherit/i,  label: 'deceased_owner'       },
  { re: /\bdamage[d]?\b/i,                      label: 'damage'               },
  { re: /salvage/i,                              label: 'salvage'              },
  { re: /مجدد|مطلي|respray|resprayed/i,         label: 'repainted'            },
]

function detectRedFlags(listing) {
  const flags = []
  const desc = (listing.description_ar ?? '') + ' ' + (listing.title ?? '')
  for (const { re, label } of RED_FLAG_PATTERNS) {
    if (re.test(desc)) flags.push(label)
  }
  if ((listing.mileage_km ?? 0) > 300000) flags.push('very_high_mileage')
  return flags
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function mileageBucket(km) {
  if (!km || km <= 0) return 'unknown'
  if (km < 25000)  return '0-25k'
  if (km < 50000)  return '25-50k'
  if (km < 75000)  return '50-75k'
  if (km < 100000) return '75-100k'
  if (km < 150000) return '100-150k'
  return '150k+'
}

function cacheKey(r) {
  return [
    r.make_slug  || r.make_en  || 'unknown',
    r.model_slug || r.model_en || 'unknown',
    r.year       || 'unknown',
    mileageBucket(r.mileage_km),
    r.city_slug  || r.city_en  || 'unknown',
  ].join('|')
}

// ── Tightened score curve ─────────────────────────────────────────────────────
// 10.0 requires 50%+ below fair (exceptional), ~3% exceed 9.0, ~10% exceed 8.0
function scoreFromRatio(ratio) {
  if (ratio < -0.50) return 10.0
  if (ratio < -0.30) return 9.0 + ((-ratio - 0.30) / 0.20) * 1.0   // 9.0–10.0
  if (ratio < -0.18) return 8.0 + ((-ratio - 0.18) / 0.12) * 1.0   // 8.0–9.0
  if (ratio < -0.08) return 6.5 + ((-ratio - 0.08) / 0.10) * 1.5   // 6.5–8.0
  if (ratio <=  0.00) return 5.5 + ((-ratio) / 0.08) * 1.0          // 5.5–6.5
  if (ratio <=  0.08) return 4.5 + (1 - ratio / 0.08) * 1.0         // 4.5–5.5
  if (ratio <=  0.18) return 3.0 + (1 - (ratio - 0.08) / 0.10) * 1.5 // 3.0–4.5
  return Math.max(0, 3.0 - Math.min(3.0, ((ratio - 0.18) / 0.30) * 3.0))
}

function labelFromScore(score) {
  if (score >= 9) return 'صفقة ممتازة'
  if (score >= 7) return 'صفقة جيدة'
  if (score >= 5) return 'سعر عادل'
  if (score >= 3) return 'سعر مرتفع'
  return 'سعر مبالغ فيه'
}

// ── Haiku call (price estimation only, not red flags) ─────────────────────────
async function callHaiku(listing) {
  const prompt =
    `أنت خبير سوق السيارات المستعملة في السعودية والخليج العربي.\n` +
    `بناءً على تفاصيل الإعلان أدناه، قدّر السعر العادل في السوق السعودية وقيّم السعر المطلوب.\n\n` +
    `**ملاحظات مهمة عن السوق السعودي (2024–2025):**\n` +
    `- الأسعار بالريال السعودي (SAR). 1 دولار ≈ 3.75 ريال.\n` +
    `- الرياض وجدة تشهد أسعاراً أعلى قليلاً من المدن الأخرى.\n` +
    `- تويوتا ونيسان وهيونداي وكيا تحتفظ بقيمتها جيداً. باترول وكامري ولاند كروزر تُعدّ سيارات عالية القيمة.\n` +
    `- هافال وإم جي وجيلي تُطرح بأسعار منافسة ومنخفضة نسبياً مقارنة بالسيارات اليابانية والكورية.\n` +
    `- العداد تحت 50 ألف كم منخفض، 100–150 ألف متوسط، فوق 200 ألف مرتفع للسوق السعودي.\n` +
    `- السيارات الأمريكية (شيفروليه، فورد، جيب، رام) تحظى بطلب مرتفع في الخليج.\n` +
    `- لا تستند إلى أسعار السوق الأمريكي أو الأوروبي — السوق السعودي مختلف تماماً.\n` +
    `- كن محافظاً في تقدير السعر العادل — لا تبالغ في التخفيض، معظم الإعلانات قريبة من السعر العادل.\n\n` +
    `**تفاصيل الإعلان:**\n` +
    `- الماركة: ${listing.make_en ?? listing.make_ar ?? 'غير محدد'}\n` +
    `- الموديل: ${listing.model_en ?? listing.model_ar ?? 'غير محدد'}\n` +
    `- سنة الصنع: ${listing.year ?? 'غير محدد'}\n` +
    `- السعر المطلوب: ${listing.price_sar?.toLocaleString('ar-SA')} ريال\n` +
    `- العداد: ${listing.mileage_km ? listing.mileage_km.toLocaleString('ar-SA') + ' كم' : 'غير محدد'}\n` +
    `- المدينة: ${listing.city_ar ?? listing.city_en ?? 'غير محدد'}\n` +
    `- اللون: ${listing.color_ar ?? listing.color_en ?? 'غير محدد'}\n` +
    `- الفئة/الترايم: ${listing.trim ?? 'غير محدد'}\n` +
    `- نوع الوقود: ${listing.fuel_type_slug ?? 'غير محدد'}\n` +
    `- ناقل الحركة: ${listing.transmission_slug ?? 'غير محدد'}\n` +
    `- الحالة: ${listing.condition ?? 'مستعملة'}\n\n` +
    `أرجع JSON فقط (بدون markdown أو شرح إضافي):\n` +
    `{"estimated_fair_price_sar":<عدد صحيح>,"confidence":"low|medium|high","reasoning_ar":"<جملة واحدة>"}`

  const msg = await callClaude(prompt)

  const text = (msg.content?.[0]?.text ?? '')
    .replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  return JSON.parse(text)
}

// ── Score derivation (combines price estimate + red flag detection) ────────────
function deriveScore(listing, aiResult) {
  const fair = aiResult.estimated_fair_price_sar
  if (!fair || fair <= 0) return null

  const ratio = (listing.price_sar - fair) / fair
  let score = scoreFromRatio(ratio)

  // Dampen towards 5.0 for low-confidence estimates
  if (aiResult.confidence === 'low') score = score * 0.5 + 5.0 * 0.5

  score = Math.round(score * 10) / 10

  // Red flag cap: any description-based red flag caps score at 5.0
  const redFlags = detectRedFlags(listing)
  const hasRedFlags = redFlags.length > 0

  if (hasRedFlags) score = Math.min(score, 5.0)

  // Low price warning: >50% below fair price, OR has red flags that explain low price
  const lowPriceWarning = ratio < -0.50 || (hasRedFlags && ratio < -0.20)

  return {
    deal_score:        score,
    deal_score_label:  labelFromScore(score),
    low_price_warning: lowPriceWarning,
    score_source:      'ai_valuation',
    score_comparables: null,
  }
}

// ── Process one listing ───────────────────────────────────────────────────────
async function processListing(listing) {
  const key = cacheKey(listing)
  let aiResult = cache[key]

  if (aiResult === undefined) {
    try {
      aiResult = await callHaiku(listing)
      cache[key] = aiResult
      saveCache()
    } catch (e) {
      process.stderr.write(`[ai] Error ${listing.id}: ${String(e.message).slice(0, 100)}\n`)
      return null
    }
  }

  if (!aiResult) return null
  return { id: listing.id, ...deriveScore(listing, aiResult) }
}

// ── Batch update Supabase ─────────────────────────────────────────────────────
const UPDATE_CONCURRENCY = 15

async function flushUpdates(updates) {
  let ok = 0
  for (let i = 0; i < updates.length; i += UPDATE_CONCURRENCY) {
    const batch = updates.slice(i, i + UPDATE_CONCURRENCY)
    await Promise.all(batch.map(async (u) => {
      const { error } = await sb.from('listings').update({
        deal_score:        u.deal_score,
        deal_score_label:  u.deal_score_label,
        low_price_warning: u.low_price_warning,
        score_source:      u.score_source,
        score_comparables: u.score_comparables,
      }).eq('id', u.id)
      if (error) process.stderr.write(`[db] Update error ${u.id}: ${error.message}\n`)
      else ok++
    }))
  }
  return ok
}

// ── Main ──────────────────────────────────────────────────────────────────────
const HAIKU_CONCURRENCY = 5
const CHECKPOINT_EVERY  = 50

;(async () => {
  // Fetch listings: --all re-scores everything, default only unscored
  let query = sb
    .from('listings')
    .select('id, make_slug, make_en, make_ar, model_slug, model_en, model_ar, year, price_sar, mileage_km, city_slug, city_en, city_ar, color_slug, color_en, color_ar, fuel_type_slug, transmission_slug, trim, condition, description_ar, title')
    .eq('contact_for_price', false)
    .not('price_sar', 'is', null)
    .eq('is_active', true)

  if (!FORCE_ALL) query = query.is('deal_score', null)

  const { data: pending, error: fetchErr } = await query
  if (fetchErr) { console.error('Fetch failed:', fetchErr.message); process.exit(1) }
  console.log(`Found ${pending.length} listings to ${FORCE_ALL ? 're-score' : 'score'}\n`)
  if (pending.length === 0) { console.log('Nothing to do.'); return }

  // Count red flags for reporting
  let redFlagCount = 0
  const scoreBefore = {}

  if (FORCE_ALL) {
    // Snapshot current scores for comparison
    const { data: snap } = await sb.from('listings').select('id, deal_score').eq('is_active', true)
    for (const r of (snap ?? [])) scoreBefore[r.id] = r.deal_score
  }

  const allUpdates = []
  let cacheHits = 0, apiCalls = 0, errors = 0

  for (let i = 0; i < pending.length; i += HAIKU_CONCURRENCY) {
    const batch = pending.slice(i, i + HAIKU_CONCURRENCY)

    const results = await Promise.all(batch.map(async (listing) => {
      const key = cacheKey(listing)
      const wasCached = cache[key] !== undefined
      const result = await processListing(listing)
      if (!result) { errors++; return null }
      if (wasCached) cacheHits++; else apiCalls++

      const flags = detectRedFlags(listing)
      if (flags.length > 0) redFlagCount++

      return result
    }))

    for (const r of results) if (r) allUpdates.push(r)

    if (allUpdates.length > 0 && (i + HAIKU_CONCURRENCY) % CHECKPOINT_EVERY < HAIKU_CONCURRENCY) {
      const flushed = await flushUpdates(allUpdates.splice(0))
      process.stdout.write(`  [${Math.min(i + HAIKU_CONCURRENCY, pending.length)}/${pending.length}] Flushed ${flushed} — api:${apiCalls} cache:${cacheHits} err:${errors}\n`)
    }
  }

  if (allUpdates.length > 0) {
    const flushed = await flushUpdates(allUpdates)
    process.stdout.write(`  [${pending.length}/${pending.length}] Final flush: ${flushed}\n`)
  }

  console.log(`\nDone — API calls: ${apiCalls} | Cache hits: ${cacheHits} | Errors: ${errors}`)
  console.log(`Red flags detected: ${redFlagCount} listings capped at ≤5.0`)

  // Summary
  const { data: summary } = await sb.from('listings').select('score_source, deal_score').eq('is_active', true)

  if (summary) {
    const withScore = summary.filter(r => r.deal_score != null)
    const count10   = withScore.filter(r => r.deal_score >= 9.5).length
    const count9    = withScore.filter(r => r.deal_score >= 9.0 && r.deal_score < 9.5).length
    const count8    = withScore.filter(r => r.deal_score >= 8.0 && r.deal_score < 9.0).length
    const count7    = withScore.filter(r => r.deal_score >= 7.0 && r.deal_score < 8.0).length
    const countLow  = withScore.filter(r => r.deal_score < 7.0).length
    const dbCount   = summary.filter(r => r.score_source === 'db_median').length
    const aiCount   = summary.filter(r => r.score_source === 'ai_valuation').length
    const noScore   = summary.filter(r => r.deal_score == null).length

    let droppedFrom10 = 0
    if (FORCE_ALL) {
      for (const r of summary) {
        if ((scoreBefore[r.id] ?? 0) >= 9.5 && (r.deal_score ?? 0) < 9.5) droppedFrom10++
      }
    }

    console.log('\n══════════════════════════════════════════════════')
    console.log('Score distribution (active listings):')
    console.log(`  9.5–10.0  (Exceptional):  ${count10}  (${((count10/withScore.length)*100).toFixed(1)}%)`)
    console.log(`  9.0–9.4   (Great Deal):   ${count9}  (${((count9/withScore.length)*100).toFixed(1)}%)`)
    console.log(`  8.0–8.9   (Good Deal):    ${count8}  (${((count8/withScore.length)*100).toFixed(1)}%)`)
    console.log(`  7.0–7.9   (Good):         ${count7}  (${((count7/withScore.length)*100).toFixed(1)}%)`)
    console.log(`  <7.0      (Fair/Over):    ${countLow}`)
    console.log(`\nScore source: DB Median ${dbCount} | AI ${aiCount} | Unscored ${noScore}`)
    if (FORCE_ALL) console.log(`Dropped from ≥9.5 to <9.5: ${droppedFrom10} listings`)
    console.log('══════════════════════════════════════════════════')
  }
})()
