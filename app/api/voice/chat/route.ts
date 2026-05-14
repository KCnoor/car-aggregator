import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

function getClients() {
  return {
    anthropic: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
    supabase:  createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    ),
  }
}

const SYSTEM_PROMPT = `أنت مستشار سيارات سعودي محترف، صديق وودود، تتكلم بلهجة سعودية طبيعية (مو فصحى). ساعد المستخدم يلاقي السيارة المناسبة من قاعدة بياناتنا. اسأل ٢-٤ أسئلة قصيرة فقط لفهم: الاستخدام (عائلي/شخصي/عمل)، حجم العائلة، الميزانية (كاش أو تقسيط)، تفضيلات الماركة. بعدها استخدم أداة البحث وارشح ٣ سيارات محددة، وفسر ليش كل وحدة مناسبة بـ ٢-٣ جمل. خل ردودك أقل من ٤٥ ثانية لما تنقال. استخدم تعابير سعودية طبيعية (حياك، تمام، أبشر، يعطيك العافية) بس بدون مبالغة. إذا المستخدم مو واضح، اسأل بالتحديد. إذا حب يضيق الخيارات أو يوسعها، سواها بدون ما تبدأ من الصفر.`

const SEARCH_TOOL: Anthropic.Tool = {
  name: 'search_listings',
  description: 'ابحث في قاعدة البيانات عن سيارات تطابق متطلبات المستخدم',
  input_schema: {
    type: 'object' as const,
    properties: {
      make:       { type: 'string',  description: 'الماركة بالإنجليزية (Toyota, Nissan, Hyundai, etc.)' },
      model:      { type: 'string',  description: 'الموديل بالإنجليزية (Camry, Patrol, etc.)' },
      year_min:   { type: 'integer', description: 'أقدم سنة' },
      year_max:   { type: 'integer', description: 'أحدث سنة' },
      price_max:  { type: 'integer', description: 'أعلى سعر بالريال' },
      price_min:  { type: 'integer', description: 'أقل سعر بالريال' },
      mileage_max:{ type: 'integer', description: 'أعلى ممشى بالكيلومتر' },
      city:       { type: 'string',  description: 'المدينة بالإنجليزية (Riyadh, Jeddah, etc.)' },
      body_type:  { type: 'string',  description: 'نوع الهيكل: sedan, suv, pickup, minivan, coupe, hatchback' },
      transmission:{ type: 'string', description: 'automatic أو manual' },
      limit:      { type: 'integer', description: 'عدد النتائج (الافتراضي 5)' },
    },
    required: [],
  },
}

type SearchInput = {
  make?: string
  model?: string
  year_min?: number
  year_max?: number
  price_max?: number
  price_min?: number
  mileage_max?: number
  city?: string
  body_type?: string
  transmission?: string
  limit?: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function searchListings(input: SearchInput, supabase: any) {
  let q = supabase
    .from('listings')
    .select('id, source, source_url, make_en, make_ar, model_en, model_ar, year, price_sar, mileage_km, city_ar, city_en, color_ar, trim, deal_score, deal_score_label, contact_for_price, photo_urls, transmission_slug, fuel_type_slug, body_type_slug, seller_type')
    .eq('is_active', true)

  if (input.make)        q = q.ilike('make_en',  `%${input.make}%`)
  if (input.model)       q = q.ilike('model_en', `%${input.model}%`)
  if (input.year_min)    q = q.gte('year', input.year_min)
  if (input.year_max)    q = q.lte('year', input.year_max)
  if (input.price_max)   q = q.lte('price_sar', input.price_max).eq('contact_for_price', false)
  if (input.price_min)   q = q.gte('price_sar', input.price_min)
  if (input.mileage_max) q = q.lte('mileage_km', input.mileage_max)
  if (input.city)        q = q.ilike('city_en', `%${input.city}%`)
  if (input.body_type)   q = q.eq('body_type_slug', input.body_type)
  if (input.transmission)q = q.eq('transmission_slug', input.transmission)

  q = q.order('deal_score', { ascending: false, nullsFirst: false })
  q = q.limit(input.limit ?? 5)

  const { data, error } = await q
  if (error) return { error: error.message, listings: [] }
  return { listings: data ?? [] }
}

type Message = { role: 'user' | 'assistant'; content: string }

function enc(obj: unknown) {
  return `data: ${JSON.stringify(obj)}\n\n`
}

export async function POST(req: NextRequest) {
  const { transcript, history = [] } = (await req.json()) as {
    transcript: string
    history: Message[]
  }

  const { anthropic, supabase } = getClients()

  // Cap at last 10 turns (20 messages)
  const trimmed: Message[] = history.slice(-20)
  const messages: Anthropic.MessageParam[] = [
    ...trimmed,
    { role: 'user', content: transcript },
  ]

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(new TextEncoder().encode(enc(obj)))

      try {
        let continueLoop = true
        let currentMessages = messages

        while (continueLoop) {
          const response = anthropic.messages.stream({
            model:      'claude-sonnet-4-6',
            max_tokens: 1024,
            system:     SYSTEM_PROMPT,
            tools:      [SEARCH_TOOL],
            messages:   currentMessages,
          })

          let accText      = ''
          let toolUseBlock: { id: string; name: string; inputJson: string } | null = null

          for await (const event of response) {
            if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
              toolUseBlock = { id: event.content_block.id, name: event.content_block.name, inputJson: '' }
            } else if (event.type === 'content_block_delta') {
              if (event.delta.type === 'text_delta') {
                accText += event.delta.text
                send({ type: 'text', content: event.delta.text })
              } else if (event.delta.type === 'input_json_delta' && toolUseBlock) {
                toolUseBlock.inputJson += event.delta.partial_json
              }
            }
          }

          void accText
          const finalMsg = await response.finalMessage()

          if (finalMsg.stop_reason === 'tool_use' && toolUseBlock) {
            let toolInput: SearchInput = {}
            try { toolInput = JSON.parse(toolUseBlock.inputJson) } catch { /* ignore */ }

            const toolResult = await searchListings(toolInput, supabase)
            send({ type: 'listings', data: toolResult.listings, filters: toolInput })

            currentMessages = [
              ...currentMessages,
              { role: 'assistant' as const, content: finalMsg.content },
              {
                role: 'user' as const,
                content: [{
                  type: 'tool_result' as const,
                  tool_use_id: toolUseBlock.id,
                  content: JSON.stringify(toolResult),
                }],
              },
            ]
          } else {
            continueLoop = false
          }
        }

        send({ type: 'done' })
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        send({ type: 'error', message: msg })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
