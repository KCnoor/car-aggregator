'use strict'
// scripts/ai-valuation.js
// AI pricing engine: calls Claude Haiku for listings without a DB-median score.
// Cache keyed by (make_slug|model_slug|year|mileage_bucket|city_slug).
// Run: ANTHROPIC_API_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/ai-valuation.js
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const fs   = require('fs')
const path = require('path')

// Load env (only if not already set in shell)
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.replace(/^export\s+/, '').trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
    }
  }
} catch { /* shell env takes priority */ }

// Also check haraj-scraper/.env for ANTHROPIC_API_KEY fallback
if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const harajEnv = path.join(__dirname, '..', '..', 'haraj-scraper', '.env')
    if (fs.existsSync(harajEnv)) {
      for (const line of fs.readFileSync(harajEnv, 'utf8').split(/\r?\n/)) {
        const m = line.replace(/^export\s+/, '').trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
        if (m && m[1] === 'ANTHROPIC_API_KEY' && !process.env.ANTHROPIC_API_KEY) {
          process.env.ANTHROPIC_API_KEY = m[2].replace(/^['"]|['"]$/g, '').trim()
        }
      }
    }
  } catch { /* ignore */ }
}

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jmfoeziomchpwanuziqm.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY    = process.env.ANTHROPIC_API_KEY

if (!SERVICE_ROLE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
if (!ANTHROPIC_KEY)    { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1) }

const Anthropic = require('@anthropic-ai/sdk')
const { createClient } = require('@supabase/supabase-js')

const ai = new Anthropic.default({ apiKey: ANTHROPIC_KEY })
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// ── Cache ─────────────────────────────────────────────────────────────────────
const CACHE_FILE = path.join(__dirname, 'ai-valuation-cache.json')
let cache = {}
try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) } catch { cache = {} }

function saveCache() {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2))
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
    r.make_slug  || 'unknown',
    r.model_slug || 'unknown',
    r.year       || 'unknown',
    mileageBucket(r.mileage_km),
    r.city_slug  || 'unknown',
  ].join('|')
}

// Same scoring functions as load-real-data.js
function scoreFromRatio(ratio) {
  if (ratio < -0.15) return Math.min(10, 9 + Math.min(1, (-ratio - 0.15) / 0.15))
  if (ratio < -0.05) return 7 + ((-ratio - 0.05) / 0.10) * 2
  if (ratio <=  0.05) return 7 - ((ratio + 0.05) / 0.10) * 2
  if (ratio <=  0.15) return 5 - ((ratio - 0.05) / 0.10) * 2
  return Math.max(0, 3 - Math.min(3, ((ratio - 0.15) / 0.15) * 3))
}

function labelFromRatio(ratio) {
  if (ratio < -0.15) return 'صفقة ممتازة'
  if (ratio < -0.05) return 'صفقة جيدة'
  if (ratio <=  0.05) return 'سعر عادل'
  if (ratio <=  0.15) return 'سعر مرتفع'
  return 'سعر مبالغ فيه'
}

// ── Haiku call ────────────────────────────────────────────────────────────────
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
    `- لا تستند إلى أسعار السوق الأمريكي أو الأوروبي — السوق السعودي مختلف تماماً.\n\n` +
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
    `{"estimated_fair_price_sar":<عدد صحيح>,"price_assessment":"great_deal|good_deal|fair|expensive|overpriced","confidence":"low|medium|high","reasoning_ar":"<جملة أو جملتان بالعربي>"}`

  const msg = await ai.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = (msg.content[0]?.text ?? '')
    .replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  return JSON.parse(text)
}

// ── Score derivation ──────────────────────────────────────────────────────────
function deriveScore(listing, aiResult) {
  const fair = aiResult.estimated_fair_price_sar
  if (!fair || fair <= 0) return null

  const ratio = (listing.price_sar - fair) / fair
  let score = scoreFromRatio(ratio)

  // Dampen towards neutral for low-confidence estimates
  if (aiResult.confidence === 'low') score = score * 0.6 + 5.0 * 0.4

  score = Math.round(score * 10) / 10

  const lowPriceWarning = ratio < -0.5
  if (lowPriceWarning) score = Math.min(score, 7)

  return {
    deal_score:        score,
    deal_score_label:  labelFromRatio(ratio),
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
      cache[key] = null
      saveCache()
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
  // 1. Fetch pending listings
  const { data: pending, error: fetchErr } = await sb
    .from('listings')
    .select('id, make_slug, make_en, make_ar, model_slug, model_en, model_ar, year, price_sar, mileage_km, city_slug, city_en, city_ar, color_slug, color_en, color_ar, fuel_type_slug, transmission_slug, trim, condition')
    .is('deal_score', null)
    .eq('contact_for_price', false)
    .not('price_sar', 'is', null)
    .eq('is_active', true)

  if (fetchErr) { console.error('Fetch failed:', fetchErr.message); process.exit(1) }
  console.log(`Found ${pending.length} listings needing AI valuation\n`)

  if (pending.length === 0) { console.log('Nothing to do.'); return }

  // 2. Process in Haiku concurrency batches
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
      return result
    }))

    for (const r of results) if (r) allUpdates.push(r)

    // Checkpoint: flush updates every CHECKPOINT_EVERY listings
    if (allUpdates.length > 0 && (i + HAIKU_CONCURRENCY) % CHECKPOINT_EVERY < HAIKU_CONCURRENCY) {
      const flushed = await flushUpdates(allUpdates.splice(0))
      process.stdout.write(`  [${i + HAIKU_CONCURRENCY}/${pending.length}] Flushed ${flushed} — api:${apiCalls} cache:${cacheHits} err:${errors}\n`)
    }
  }

  // Final flush
  if (allUpdates.length > 0) {
    const flushed = await flushUpdates(allUpdates)
    process.stdout.write(`  [${pending.length}/${pending.length}] Final flush: ${flushed}\n`)
  }

  console.log(`\nDone — API calls: ${apiCalls} | Cache hits: ${cacheHits} | Errors: ${errors}`)

  // 3. Summary report
  const { data: summary } = await sb
    .from('listings')
    .select('score_source, deal_score')
    .eq('is_active', true)

  if (summary) {
    const dbCount  = summary.filter(r => r.score_source === 'db_median').length
    const aiCount  = summary.filter(r => r.score_source === 'ai_valuation').length
    const noScore  = summary.filter(r => r.deal_score == null).length

    console.log('\n══════════════════════════════════════════════════')
    console.log('Score source breakdown (active listings):')
    console.log(`  DB Median:     ${dbCount}`)
    console.log(`  AI Valuation:  ${aiCount}`)
    console.log(`  No Score:      ${noScore}  (contact-for-price or missing fields)`)
    console.log('══════════════════════════════════════════════════')
  }
})()
