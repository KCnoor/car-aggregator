import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Waitlist capture for the Analyzer / Pulse teaser pages.
// At least one of email or phone is required (DB-level CHECK).
// mode_interested is free-form text so new modes can be added without a
// schema migration.

export const runtime = 'nodejs'

function isEmail (s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}
function isPhone (s: string) {
  // Permissive: 8+ digits with optional +, spaces, dashes.
  const digits = s.replace(/[^\d]/g, '')
  return digits.length >= 8 && digits.length <= 16
}

export async function POST (req: NextRequest) {
  let body: { email?: string; phone?: string; mode?: string } = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const email = body.email?.trim() || null
  const phone = body.phone?.trim() || null
  const mode  = body.mode?.trim()
  if (!mode) {
    return NextResponse.json({ error: 'missing mode' }, { status: 400 })
  }
  if (!email && !phone) {
    return NextResponse.json({ error: 'email or phone required' }, { status: 400 })
  }
  if (email && !isEmail(email)) {
    return NextResponse.json({ error: 'invalid email' }, { status: 400 })
  }
  if (phone && !isPhone(phone)) {
    return NextResponse.json({ error: 'invalid phone' }, { status: 400 })
  }

  const ua = req.headers.get('user-agent') ?? null
  const { error } = await supabase.from('waitlist').insert({
    email, phone, mode_interested: mode, user_agent: ua,
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
