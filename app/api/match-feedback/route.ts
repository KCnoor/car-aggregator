import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// "This isn't quite me" capture from /match.
// Required: what_they_wanted (free text). Optional: persona_selected.

export const runtime = 'nodejs'

export async function POST (req: NextRequest) {
  let body: { persona?: string; text?: string } = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const text = (body.text ?? '').trim()
  const persona = body.persona?.trim() || null
  if (!text) {
    return NextResponse.json({ error: 'text required' }, { status: 400 })
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: 'text too long' }, { status: 400 })
  }

  const ua = req.headers.get('user-agent') ?? null
  const { error } = await supabase.from('match_feedback').insert({
    persona_selected: persona,
    what_they_wanted: text,
    user_agent: ua,
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
