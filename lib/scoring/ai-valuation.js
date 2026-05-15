'use strict'
// Claude-based fair-price estimation. Used by Layer 4 (score.js) when no
// statistical baseline (>=5 comparables) is available for the listing's
// (make, model, year, city).
//
// - Raw HTTPS to api.anthropic.com (matches existing scripts; the
//   @anthropic-ai/sdk dist is missing from node_modules so we can't use the
//   SDK without reinstalling — sticking with what works).
// - Prompt caches the (static) market-context system prompt — every listing
//   call shares the same system prefix, so cache hits cost 1/10 the input rate.
// - File-based cache (ai-valuation-cache.json) is preserved as-is to avoid
//   invalidating the ~900KB of valid valuations already stored.
// - Returns usage info so the caller (score.js) can run a cost guard.

const fs    = require('fs')
const path  = require('path')
const https = require('https')

const { valuationCacheKey } = require('./normalize')
const baselineLib = require('./baseline')
const redflagLib  = require('./redflags')

// ── Pricing (Haiku 4.5; update if Anthropic changes rates) ─────────────────
// $1.00 per 1M input tokens, $5.00 per 1M output tokens, $0.10 per 1M cached input.
const PRICE_INPUT_USD_PER_MTOK         = 1.00
const PRICE_OUTPUT_USD_PER_MTOK        = 5.00
const PRICE_CACHED_INPUT_USD_PER_MTOK  = 0.10

const MODEL = 'claude-haiku-4-5-20251001'

const SYSTEM_PROMPT = [
  'أنت خبير سوق السيارات المستعملة في السعودية والخليج العربي.',
  'تقدّر السعر العادل في السوق السعودية بناءً على تفاصيل الإعلان وتقيّم السعر المطلوب.',
  '',
  'ملاحظات مهمة عن السوق السعودي (2024–2025):',
  '- الأسعار بالريال السعودي (SAR). 1 دولار ≈ 3.75 ريال.',
  '- الرياض وجدة تشهد أسعاراً أعلى قليلاً من المدن الأخرى.',
  '- تويوتا ونيسان وهيونداي وكيا تحتفظ بقيمتها جيداً. باترول وكامري ولاند كروزر تُعدّ سيارات عالية القيمة.',
  '- هافال وإم جي وجيلي تُطرح بأسعار منافسة ومنخفضة نسبياً مقارنة بالسيارات اليابانية والكورية.',
  '- العداد تحت 50 ألف كم منخفض، 100–150 ألف متوسط، فوق 200 ألف مرتفع للسوق السعودي.',
  '- السيارات الأمريكية (شيفروليه، فورد، جيب، رام) تحظى بطلب مرتفع في الخليج.',
  '- لا تستند إلى أسعار السوق الأمريكي أو الأوروبي — السوق السعودي مختلف تماماً.',
  '- كن محافظاً في تقدير السعر العادل — لا تبالغ في التخفيض، معظم الإعلانات قريبة من السعر العادل.',
  '',
  'أرجع JSON فقط (بدون markdown أو شرح إضافي):',
  '{"estimated_fair_price_sar":<عدد صحيح>,"confidence":"low|medium|high","reasoning_ar":"<جملة واحدة>"}',
].join('\n')

function buildUserPrompt (listing) {
  return [
    'تفاصيل الإعلان:',
    `- الماركة: ${listing.make_en ?? listing.make_ar ?? 'غير محدد'}`,
    `- الموديل: ${listing.model_en ?? listing.model_ar ?? 'غير محدد'}`,
    `- سنة الصنع: ${listing.year ?? 'غير محدد'}`,
    `- السعر المطلوب: ${listing.price_sar?.toLocaleString('ar-SA')} ريال`,
    `- العداد: ${listing.mileage_km ? listing.mileage_km.toLocaleString('ar-SA') + ' كم' : 'غير محدد'}`,
    `- المدينة: ${listing.city_ar ?? listing.city_en ?? 'غير محدد'}`,
    `- اللون: ${listing.color_ar ?? listing.color_en ?? 'غير محدد'}`,
    `- الفئة/الترايم: ${listing.trim ?? 'غير محدد'}`,
    `- نوع الوقود: ${listing.fuel_type_slug ?? 'غير محدد'}`,
    `- ناقل الحركة: ${listing.transmission_slug ?? 'غير محدد'}`,
    `- الحالة: ${listing.condition ?? 'مستعملة'}`,
  ].join('\n')
}

// ── Cache ──────────────────────────────────────────────────────────────────
const CACHE_FILE_DEFAULT = path.join(__dirname, '..', '..', 'scripts', 'ai-valuation-cache.json')

class Valuator {
  constructor (opts = {}) {
    if (!opts.anthropicKey) throw new Error('Valuator: anthropicKey required')
    this.apiKey = opts.anthropicKey
    this.cacheFile = opts.cacheFile ?? CACHE_FILE_DEFAULT
    this.cache = {}
    try { this.cache = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8')) } catch { this.cache = {} }
    this.totalsUsage = {
      input_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      cache_hits_file: 0,
      api_calls: 0,
      errors: 0,
    }
    this.dirty = false
  }

  saveCache () {
    if (!this.dirty) return
    fs.writeFileSync(this.cacheFile, JSON.stringify(this.cache, null, 2))
    this.dirty = false
  }

  async _callClaude (listing, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const resp = await new Promise((resolve, reject) => {
          const body = JSON.stringify({
            model: MODEL,
            max_tokens: 250,
            system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: buildUserPrompt(listing) }],
          })
          const req = https.request({
            hostname: 'api.anthropic.com',
            path: '/v1/messages',
            method: 'POST',
            timeout: 30000,
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': this.apiKey,
              'anthropic-version': '2023-06-01',
              'anthropic-beta': 'prompt-caching-2024-07-31',
              'Content-Length': Buffer.byteLength(body),
            },
          }, (res) => {
            let data = ''
            res.on('data', c => data += c)
            res.on('end', () => {
              try {
                const parsed = JSON.parse(data)
                if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${parsed.error?.message ?? data.slice(0, 200)}`))
                else resolve(parsed)
              } catch (e) {
                reject(new Error(`JSON parse failed (status ${res.statusCode}): ${data.slice(0, 100)}`))
              }
            })
          })
          req.on('timeout', () => { req.destroy(new Error('Request timed out')) })
          req.on('error', reject)
          req.write(body)
          req.end()
        })
        return resp
      } catch (e) {
        if (attempt < retries - 1) await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
        else throw e
      }
    }
  }

  _trackUsage (usage) {
    if (!usage) return
    const inp = usage.input_tokens ?? 0
    const cacheCreate = usage.cache_creation_input_tokens ?? 0
    const cacheRead   = usage.cache_read_input_tokens ?? 0
    const out = usage.output_tokens ?? 0
    this.totalsUsage.input_tokens               += inp
    this.totalsUsage.cache_creation_input_tokens += cacheCreate
    this.totalsUsage.cache_read_input_tokens     += cacheRead
    this.totalsUsage.output_tokens              += out
    // Cost: cached reads are charged at the cheaper rate; cache creation is 1.25x input.
    const cost =
      (inp         * PRICE_INPUT_USD_PER_MTOK        / 1_000_000) +
      (cacheCreate * PRICE_INPUT_USD_PER_MTOK * 1.25 / 1_000_000) +
      (cacheRead   * PRICE_CACHED_INPUT_USD_PER_MTOK / 1_000_000) +
      (out         * PRICE_OUTPUT_USD_PER_MTOK       / 1_000_000)
    this.totalsUsage.cost_usd += cost
    return cost
  }

  // Returns { fair_price_sar, confidence, reasoning_ar, source: 'cache'|'api' } or null.
  async valuate (listing) {
    const key = valuationCacheKey(listing)
    if (this.cache[key] !== undefined) {
      this.totalsUsage.cache_hits_file++
      const v = this.cache[key]
      if (!v) return null
      return { ...v, source: 'cache' }
    }

    let resp
    try {
      resp = await this._callClaude(listing)
    } catch (e) {
      this.totalsUsage.errors++
      process.stderr.write(`[valuator] error ${listing.id}: ${String(e.message).slice(0, 120)}\n`)
      return null
    }

    this.totalsUsage.api_calls++
    this._trackUsage(resp.usage)

    let parsed
    try {
      const text = (resp.content?.[0]?.text ?? '')
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim()
      parsed = JSON.parse(text)
    } catch (e) {
      this.totalsUsage.errors++
      process.stderr.write(`[valuator] parse error ${listing.id}: ${String(e.message).slice(0, 80)}\n`)
      return null
    }

    if (!parsed?.estimated_fair_price_sar) return null

    const cached = {
      estimated_fair_price_sar: parsed.estimated_fair_price_sar,
      confidence:               parsed.confidence ?? 'medium',
      reasoning_ar:             parsed.reasoning_ar ?? '',
    }
    this.cache[key] = cached
    this.dirty = true
    return { ...cached, source: 'api' }
  }

  // Score a listing using AI valuation. Returns same shape as
  // baseline.scoreAgainstBaseline plus { reference_price, ratio, confidence }.
  async scoreListing (listing) {
    const valuation = await this.valuate(listing)
    if (!valuation || !valuation.estimated_fair_price_sar) return null

    const fair = valuation.estimated_fair_price_sar
    if (listing.price_sar == null || listing.price_sar <= 0) return null

    const ratio = (listing.price_sar - fair) / fair
    let score = baselineLib.scoreFromRatio(ratio)
    // Low-confidence estimates dampen toward 5.0 (preserves prior behaviour).
    if (valuation.confidence === 'low') score = score * 0.5 + 5.0 * 0.5
    score = Math.round(score * 10) / 10

    return {
      deal_score:        score,
      score_source:      'ai_valuation',
      score_tier:        baselineLib.scoreTier(score),
      score_comparables: null,
      reference_price:   fair,
      ratio,
      confidence:        valuation.confidence,
      reasoning_ar:      valuation.reasoning_ar,
      valuation_source:  valuation.source,
    }
  }

  projectedSpendForRemaining (processedCount, remainingCount) {
    if (processedCount <= 0) return 0
    const avgPerListing = this.totalsUsage.cost_usd / processedCount
    return this.totalsUsage.cost_usd + (avgPerListing * remainingCount)
  }

  cacheHitRate () {
    const total = this.totalsUsage.cache_hits_file + this.totalsUsage.api_calls
    return total === 0 ? 0 : this.totalsUsage.cache_hits_file / total
  }
}

module.exports = {
  Valuator,
  MODEL,
  PRICE_INPUT_USD_PER_MTOK,
  PRICE_OUTPUT_USD_PER_MTOK,
  PRICE_CACHED_INPUT_USD_PER_MTOK,
}
