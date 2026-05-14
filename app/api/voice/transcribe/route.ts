import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(req: NextRequest) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  try {
    const formData = await req.formData()
    const audio = formData.get('audio') as File | null

    if (!audio) return NextResponse.json({ error: 'No audio' }, { status: 400 })

    const transcription = await openai.audio.transcriptions.create({
      file: audio,
      model: 'whisper-1',
      language: 'ar',
    })

    return NextResponse.json({ text: transcription.text })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
