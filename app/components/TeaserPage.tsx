'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useLang } from './LangContext'

// Shared component for the two teaser modes (Analyzer + Pulse). Renders the
// character + description + a static preview SVG + a waitlist form. v0
// placeholder previews are inline SVG so we don't ship binary assets we'd
// have to swap later — easy to replace with real mockup images by passing
// `previewSrc` instead.

export type TeaserMode = {
  modeKey: string            // saved to waitlist.mode_interested
  emoji: string
  characterAr: string
  characterEn: string
  titleAr: string
  titleEn: string
  taglineAr: string
  taglineEn: string
  descriptionAr: string
  descriptionEn: string
  accent: string
  bg: string
  preview: 'analyzer' | 'pulse'
}

export default function TeaserPage ({ mode }: { mode: TeaserMode }) {
  const { lang } = useLang()
  const isAr = lang === 'ar'
  const [email, setEmail]   = useState('')
  const [phone, setPhone]   = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string>('')

  async function submit (e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() && !phone.trim()) return
    setStatus('sending'); setErrorMsg('')
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          mode:  mode.modeKey,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'failed')
      }
      setStatus('sent'); setEmail(''); setPhone('')
    } catch (e: unknown) {
      setStatus('error')
      setErrorMsg(e instanceof Error ? e.message : (isAr ? 'حصل خطأ' : 'Something went wrong'))
    }
  }

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="min-h-screen" style={{ background: 'var(--bg-page)' }}>
      {/* Hero — sky-toned. The previous dark navy gradient is gone; the mode
          accent now appears only as a tint near the bottom of the hero so
          the four teaser pages still feel distinct. */}
      <section
        className="relative overflow-hidden"
        style={{
          background: `linear-gradient(180deg, #E0F2FE 0%, #DBEAFE 60%, ${mode.accent}15 100%)`,
        }}
      >
        <div className="max-w-screen-md mx-auto px-4 py-10 sm:py-14 text-center">
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="text-6xl sm:text-7xl mb-3"
            aria-hidden
          >
            {mode.emoji}
          </motion.div>
          <p
            className="text-xs sm:text-sm font-semibold tracking-wide"
            style={{ color: mode.accent }}
          >
            {isAr ? mode.characterAr : mode.characterEn}
          </p>
          <h1
            className="mt-1 font-extrabold text-2xl sm:text-3xl leading-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            {isAr ? mode.titleAr : mode.titleEn}
          </h1>
          <p
            className="mt-3 text-sm sm:text-base leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}
          >
            {isAr ? mode.taglineAr : mode.taglineEn}
          </p>
        </div>
      </section>

      <section className="max-w-screen-md mx-auto px-4 py-8 sm:py-10">
        {/* Description */}
        <div className="rounded-2xl p-5 sm:p-6 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--hairline)', boxShadow: 'var(--shadow-soft)' }}>
          <p className="text-[14px] sm:text-[15px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>
            {isAr ? mode.descriptionAr : mode.descriptionEn}
          </p>
        </div>

        {/* Preview */}
        <div
          className="mt-5 rounded-2xl p-4 sm:p-6 border overflow-hidden"
          style={{
            background: mode.bg,
            borderColor: `${mode.accent}40`,
          }}
        >
          <div className="text-[11px] font-bold tracking-widest uppercase mb-3" style={{ color: mode.accent }}>
            {isAr ? 'معاينة' : 'Preview'}
          </div>
          {mode.preview === 'analyzer' ? <AnalyzerPreview accent={mode.accent} lang={lang} /> : <PulsePreview accent={mode.accent} lang={lang} />}
        </div>

        {/* Waitlist form */}
        <div
          className="mt-5 rounded-2xl p-5 sm:p-6 border"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--hairline)', boxShadow: 'var(--shadow-soft)' }}
        >
          <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
            {isAr ? 'كن أول من يجرب' : 'Be the first to try it'}
          </h3>
          <p className="mt-1.5 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
            {isAr
              ? 'اشترك ونخبرك عند الإطلاق. إيميل أو رقم جوال — اللي يناسبك.'
              : "Sign up and we'll ping you at launch. Email or phone — whichever works for you."}
          </p>

          <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
            <input
              type="email"
              inputMode="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              className="rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2"
              style={{
                background: 'var(--bg-page)',
                border: '1px solid var(--hairline)',
                color: 'var(--text-primary)',
              }}
              autoComplete="email"
            />
            <input
              type="tel"
              inputMode="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+966 5xx xxx xxx"
              className="rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2"
              style={{
                background: 'var(--bg-page)',
                border: '1px solid var(--hairline)',
                color: 'var(--text-primary)',
              }}
              autoComplete="tel"
            />
            <div className="flex items-center gap-3 mt-1">
              <button
                type="submit"
                disabled={(!email.trim() && !phone.trim()) || status === 'sending'}
                className="rounded-xl px-5 py-2.5 font-bold text-sm transition-opacity disabled:opacity-40"
                style={{ background: mode.accent, color: 'white' }}
              >
                {status === 'sending'
                  ? (isAr ? '... جاري الإرسال' : 'Sending…')
                  : (isAr ? 'اشتراك' : 'Sign up')}
              </button>
              {status === 'sent' && (
                <span className="text-[12px] font-semibold" style={{ color: mode.accent }}>
                  {isAr ? 'وصلتنا بياناتك ✓ نراك في الإطلاق' : "We've got your details ✓ See you at launch"}
                </span>
              )}
              {status === 'error' && (
                <span className="text-[12px] font-semibold text-red-700">
                  {errorMsg || (isAr ? 'حصل خطأ، حاول مرة ثانية' : 'Something went wrong — please try again')}
                </span>
              )}
            </div>
          </form>
        </div>
      </section>
    </div>
  )
}

// ── Placeholder previews ─────────────────────────────────────────────────────
// Inline SVG so we don't commit binary mockup files we'd swap later.

function AnalyzerPreview ({ accent, lang }: { accent: string; lang: 'ar' | 'en' }) {
  // Faux scatter / bubble chart: price vs. mileage, bubble size = deal score.
  return (
    <svg viewBox="0 0 320 180" className="w-full h-auto block" aria-label={lang === 'ar' ? 'معاينة المحلّل' : 'Analyzer preview'}>
      <rect x="0" y="0" width="320" height="180" fill="none" />
      <line x1="32" y1="155" x2="310" y2="155" stroke={accent} strokeOpacity="0.35" strokeWidth="1"/>
      <line x1="32" y1="155" x2="32"  y2="20"  stroke={accent} strokeOpacity="0.35" strokeWidth="1"/>
      {/* gridlines */}
      {[40, 70, 100, 130].map(y => (
        <line key={y} x1="32" y1={y} x2="310" y2={y} stroke={accent} strokeOpacity="0.10" strokeWidth="0.7"/>
      ))}
      {/* bubbles */}
      {[
        { cx: 60,  cy: 130, r: 6  }, { cx: 90,  cy: 110, r: 10 },
        { cx: 110, cy: 95,  r: 8  }, { cx: 130, cy: 80,  r: 14 },
        { cx: 160, cy: 70,  r: 11 }, { cx: 180, cy: 55,  r: 16 },
        { cx: 210, cy: 45,  r: 13 }, { cx: 240, cy: 35,  r: 9  },
        { cx: 265, cy: 60,  r: 7  }, { cx: 290, cy: 90,  r: 5  },
      ].map((b, i) => (
        <circle key={i} cx={b.cx} cy={b.cy} r={b.r} fill={accent} fillOpacity={0.30 + (i % 4) * 0.12} stroke={accent} strokeWidth="1"/>
      ))}
      {/* labels */}
      <text x="32" y="172" fontSize="9" fill={accent} fillOpacity="0.7">{lang === 'ar' ? 'الممشى →' : 'Mileage →'}</text>
      <text x="32" y="14"  fontSize="9" fill={accent} fillOpacity="0.7">{lang === 'ar' ? 'السعر ↑' : 'Price ↑'}</text>
    </svg>
  )
}

function PulsePreview ({ accent, lang }: { accent: string; lang: 'ar' | 'en' }) {
  // Faux dashboard: 3 stat tiles + sparkline.
  return (
    <svg viewBox="0 0 320 180" className="w-full h-auto block" aria-label={lang === 'ar' ? 'معاينة نبض السوق' : 'Market Pulse preview'}>
      {/* stat tiles */}
      {[0, 110, 220].map((x, i) => (
        <g key={i}>
          <rect x={x} y="0" width="92" height="56" rx="8" fill={accent} fillOpacity="0.10"/>
          <rect x={x + 8} y="8" width="44" height="6" rx="3" fill={accent} fillOpacity="0.35"/>
          <rect x={x + 8} y="22" width="60" height="14" rx="3" fill={accent} fillOpacity="0.85"/>
          <rect x={x + 8} y="42" width="38" height="5" rx="2" fill={accent} fillOpacity="0.45"/>
        </g>
      ))}
      {/* sparkline panel */}
      <rect x="0" y="72" width="320" height="100" rx="10" fill={accent} fillOpacity="0.08"/>
      <polyline
        points="20,140 50,120 80,128 110,100 140,108 170,80 200,92 230,70 260,82 290,58"
        fill="none" stroke={accent} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
      />
      {[20, 50, 80, 110, 140, 170, 200, 230, 260, 290].map((cx, i) => (
        <circle key={cx} cx={cx} cy={[140,120,128,100,108,80,92,70,82,58][i]} r="2.4" fill={accent}/>
      ))}
    </svg>
  )
}
