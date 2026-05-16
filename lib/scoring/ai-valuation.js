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

// Static system prompt — cacheable. Anthropic's ephemeral prompt cache
// expects this block to exceed ~1024 tokens for cache to activate. We pad
// the prompt with comprehensive market context (was previously inlined per
// call) to cross that threshold while still being useful guidance.
const SYSTEM_PROMPT = [
  'You are a Saudi Arabian used-car market valuation expert. Estimate the fair Saudi market price (SAR) for the listing provided and output a strict JSON object — nothing else.',
  '',
  'Output schema (return ONLY this JSON, no markdown, no preamble):',
  '{"estimated_fair_price_sar":<int>,"confidence":"low"|"medium"|"high","reasoning_short":"<≤80 chars>"}',
  '',
  'Market context (Saudi Arabia, 2024–2026):',
  '- Currency: SAR. 1 USD ≈ 3.75 SAR. Use SAR ONLY.',
  '- Riyadh and Jeddah list ~5–10% higher than Dammam/Khobar/Tabuk. Coastal vs interior is small (<5%).',
  '- Japanese/Korean (Toyota, Nissan, Hyundai, Kia) retain value well; Toyota Camry, Hyundai Accent, Kia K5 are everyday cars; Land Cruiser, Patrol, Suburban are premium SUVs.',
  '- Chinese makes (Haval, MG, Geely, Changan, Jetour, BYD, Chery, Exeed) are priced lower than equivalent Japanese cars: a 2024 Haval H6 is ~40% cheaper than a 2024 Camry.',
  '- American brands (Chevrolet, Ford, GMC, Jeep, Cadillac, Dodge, RAM) trade actively; full-size SUVs/pickups command a premium.',
  '- European luxury (BMW, Mercedes, Audi, Porsche, Lexus, Land Rover) is high-priced and prices vary widely by trim — be conservative.',
  '- Mileage anchors: <50k km = low, 50–100k = medium-low, 100–150k = medium, 150–200k = high, >200k = very high.',
  '- Saudi market is distinct from US/EU. Do NOT apply US/EU price points.',
  '- Be conservative — most listings are close to fair price; only flag clearly under- or over-priced when context strongly supports it.',
  '- Red flags (mentions of حادث / accident / damaged / inheritance / deceased / expired registration / engine overhauled / airbags deployed / mileage > 300,000 km) drop the score to ≤ 5.0 regardless of price.',
  '',
  'When market_context is provided, anchor your estimate within ±15% of that median unless you have strong reason to deviate.',
  'Confidence levels:',
  '- high   = at least one of: market_context with sample_size >= 10, or a clearly mainstream model+year combo',
  '- medium = mainstream brand but limited context or unusual trim',
  '- low    = niche brand, unusual config, or no usable context',
  '',
  'Reasoning_short MUST be ≤ 80 characters; no quotes, no special chars beyond basic punctuation.',
].join('\n')

function buildUserPrompt (listing, marketCtx) {
  const lines = [
    'Listing:',
    `make=${listing.make_en ?? listing.make_ar ?? 'unknown'}`,
    `model=${listing.model_en ?? listing.model_ar ?? 'unknown'}`,
    `year=${listing.year ?? 'unknown'}`,
    `mileage_km=${listing.mileage_km ?? 'unknown'}`,
    `city=${listing.city_en ?? listing.city_ar ?? 'unknown'}`,
    `price_sar=${listing.price_sar}`,
    `source_tier=${listing.source_quality_tier ?? 3}`,
  ]
  if (listing.description_ar) {
    lines.push(`description=${String(listing.description_ar).slice(0, 500)}`)
  }
  if (marketCtx && marketCtx.median_price) {
    lines.push('')
    lines.push('market_context:')
    lines.push(`median_price_sar=${Math.round(marketCtx.median_price)}`)
    lines.push(`sample_size=${marketCtx.sample_size}`)
    lines.push(`scope=${marketCtx.scope}`)
  }
  return lines.join('\n')
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

  async _callClaude (listing, marketCtx, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const resp = await new Promise((resolve, reject) => {
          const body = JSON.stringify({
            model: MODEL,
            max_tokens: 200,   // tight cap — output is compact JSON
            system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: buildUserPrompt(listing, marketCtx) }],
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

  // Returns { fair_price_sar, confidence, reasoning_short, source: 'cache'|'api' } or null.
  async valuate (listing, marketCtx = null) {
    const key = valuationCacheKey(listing)
    if (this.cache[key] !== undefined) {
      this.totalsUsage.cache_hits_file++
      const v = this.cache[key]
      if (!v) return null
      return { ...v, source: 'cache' }
    }

    let resp
    try {
      resp = await this._callClaude(listing, marketCtx)
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
      reasoning_ar:             parsed.reasoning_short ?? parsed.reasoning_ar ?? '',
    }
    this.cache[key] = cached
    this.dirty = true
    return { ...cached, source: 'api' }
  }

  // Score a listing using AI valuation. Returns same shape as
  // baseline.scoreAgainstBaseline plus { reference_price, ratio, confidence }.
  async scoreListing (listing, marketCtx = null) {
    const valuation = await this.valuate(listing, marketCtx)
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
