import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are a car search assistant for a Saudi Arabia car listings site.
Extract structured search filters from the user's query (in English or Arabic).

The available filter fields are:
- make: car brand (e.g. "Toyota", "Nissan", "Hyundai", "BMW", "Mercedes")
- model: car model (e.g. "Camry", "Patrol", "Corolla")
- city: one of "Riyadh", "Jeddah", "Dammam"
- maxPrice: maximum price in SAR (integer)
- minPrice: minimum price in SAR (integer)
- maxMileage: maximum mileage in km (integer)
- minYear: minimum year (integer, e.g. 2020)
- maxYear: maximum year (integer, e.g. 2023)

Respond ONLY with valid JSON. No explanation, no markdown, no extra text.
Only include fields the user actually mentioned. If a field wasn't mentioned, omit it.

Examples:
- "cheap Toyota under 80000" → {"make":"Toyota","maxPrice":80000}
- "كامري 2022 في الرياض" → {"make":"Toyota","model":"Camry","minYear":2022,"maxYear":2022,"city":"Riyadh"}
- "patrol less than 200k" → {"make":"Nissan","model":"Patrol","maxPrice":200000}
- "new cars under 100000 riyadh" → {"city":"Riyadh","maxPrice":100000,"minYear":2022}
- "سيارات رخيصة في جدة" → {"city":"Jeddah","maxPrice":70000}`

export async function POST(req: NextRequest) {
  const { query } = await req.json()

  if (!query?.trim()) {
    return NextResponse.json({ filters: {} })
  }

  const message = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: query }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '{}'

  let filters: Record<string, unknown> = {}
  try {
    filters = JSON.parse(text.trim())
  } catch {
    filters = {}
  }

  return NextResponse.json({ filters })
}
