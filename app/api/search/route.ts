import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are a car search assistant for a Saudi Arabia car listings site.
Extract HARD FILTERS (explicit constraints only) and a SORT PREFERENCE (for subjective/qualitative terms).

HARD FILTERS — only set when explicitly stated by the user:
- make: car brand only if named (Toyota, Nissan, Hyundai, BMW, Mercedes, Kia, Honda, Ford, GMC)
- model: specific model only if named (Camry, Patrol, Corolla, Sonata, etc.)
- city: one of "Riyadh", "Jeddah", "Dammam" — only if explicitly mentioned
- maxPrice: integer SAR — only if the user states a specific number or amount
- minPrice: integer SAR — only if explicitly stated
- maxMileage: integer km — only if the user gives a specific number
- minYear / maxYear: integer — only if the user mentions a specific year or range

SORT PREFERENCE — set the "sort" field for qualitative/subjective signals:
- لقطة / صفقة / bargain / great deal / best value → "deal_score"
- رخيصة / cheap / affordable / بسعر كويس / اقتصادية → "price_asc"
- ممشى قليل / low mileage / عداد قليل / low km → "mileage_asc"
- جديدة / new / حديثة / latest / آخر موديل → "year_desc"
- فخمة / high-end / expensive → "price_desc"
- Omit "sort" entirely if no qualitative signal is present.

CRITICAL: NEVER create a hard filter for subjective or qualitative words.
These must only influence sort, never filter:
رخيصة, نظيفة, لقطة, ممشى قليل, حلوة, زينة, مرتبة, نظيف, cheap, clean, nice, good condition.

Respond ONLY with valid JSON. No markdown, no explanation, no extra text.
Only include fields that apply. Omit everything else.

Examples:
"كامري لقطة" → {"make":"Toyota","model":"Camry","sort":"deal_score"}
"سيارة رخيصة في الرياض" → {"city":"Riyadh","sort":"price_asc"}
"باترول بأقل من 200 ألف" → {"make":"Nissan","model":"Patrol","maxPrice":200000}
"ممشى قليل تويوتا" → {"make":"Toyota","sort":"mileage_asc"}
"كامري 2022 جدة أقل من 90 ألف" → {"make":"Toyota","model":"Camry","minYear":2022,"maxYear":2022,"city":"Jeddah","maxPrice":90000}
"cheap Patrol under 200k" → {"make":"Nissan","model":"Patrol","maxPrice":200000,"sort":"price_asc"}
"نظيفة في الدمام" → {"city":"Dammam","sort":"deal_score"}`

type AIFilters = {
  make?: string
  model?: string
  city?: string
  maxPrice?: number
  minPrice?: number
  maxMileage?: number
  minYear?: number
  maxYear?: number
}

export async function POST(req: NextRequest) {
  const { query } = await req.json()

  if (!query?.trim()) {
    return NextResponse.json({ filters: {}, sort: null })
  }

  const message = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: query }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '{}'

  let parsed: { filters?: AIFilters; sort?: string } & AIFilters = {}
  try {
    parsed = JSON.parse(text.trim())
  } catch {
    return NextResponse.json({ filters: {}, sort: null })
  }

  const VALID_SORTS = ['deal_score', 'price_asc', 'price_desc', 'mileage_asc', 'year_desc']
  const sort = parsed.sort && VALID_SORTS.includes(parsed.sort) ? parsed.sort : null

  const { sort: _s, ...rest } = parsed
  void _s
  const filters: AIFilters = {
    make: rest.make,
    model: rest.model,
    city: rest.city,
    maxPrice: rest.maxPrice,
    minPrice: rest.minPrice,
    maxMileage: rest.maxMileage,
    minYear: rest.minYear,
    maxYear: rest.maxYear,
  }
  Object.keys(filters).forEach(k => {
    if (filters[k as keyof AIFilters] === undefined) delete filters[k as keyof AIFilters]
  })

  return NextResponse.json({ filters, sort })
}
