import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(req: NextRequest) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  try {
    const { text, voice = 'shimmer' } = (await req.json()) as { text: string; voice?: string }

    if (!text?.trim()) return NextResponse.json({ error: 'No text' }, { status: 400 })

    const response = await openai.audio.speech.create({
      model:           'tts-1',
      voice:           voice as 'shimmer' | 'alloy' | 'echo' | 'fable' | 'nova' | 'onyx',
      input:           text,
      response_format: 'mp3',
    })

    // Stream the audio bytes back directly
    return new Response(response.body, {
      headers: {
        'Content-Type':  'audio/mpeg',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
