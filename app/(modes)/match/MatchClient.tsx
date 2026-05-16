'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import type { Listing } from '@/lib/supabase'
import ListingCard from '@/app/components/ListingCard'

type PersonaKey = 'big_family' | 'first_car' | 'upgrade'

type Persona = {
  key: PersonaKey
  emoji: string
  titleAr: string
  blurbAr: string
  accent: string
  bg: string
  reasoning: (l: Listing) => string  // per-listing "why this fits" string
}

const ROSE = '#B8336A'
const GOLD = '#D4A574'
const NAVY = '#0A1628'

const PERSONAS: Persona[] = [
  {
    key: 'big_family',
    emoji: '👨‍👩‍👧‍👦',
    titleAr: 'عائلة كبيرة',
    blurbAr: 'سيارة فيها مساحة وأمان للجميع — 7 ركاب أو أكثر، تشغيل عملي يومي.',
    accent: ROSE,
    bg: 'linear-gradient(135deg, rgba(184,51,106,0.18) 0%, rgba(184,51,106,0.06) 100%)',
    reasoning: (l) => {
      const parts: string[] = []
      if (l.body_type_slug === 'minivan') parts.push('فان عائلي يستوعب 7+ ركاب براحة')
      else if (l.body_type_slug === 'suv') parts.push('SUV واسع يناسب العائلة الكبيرة')
      if (l.year && l.year >= 2020) parts.push(`موديل حديث (${l.year}) بأنظمة أمان متطورة`)
      else if (l.year) parts.push(`موديل ${l.year} متين`)
      if (l.mileage_km != null && l.mileage_km < 80000) parts.push('ممشى قليل')
      return parts.join(' · ') || 'مناسبة للعائلة الكبيرة'
    },
  },
  {
    key: 'first_car',
    emoji: '🌱',
    titleAr: 'أول سيارة',
    blurbAr: 'سعر معقول تحت 50 ألف، استهلاك وصيانة منخفضة، موثوقية عالية.',
    accent: GOLD,
    bg: 'linear-gradient(135deg, rgba(212,165,116,0.22) 0%, rgba(212,165,116,0.06) 100%)',
    reasoning: (l) => {
      const parts: string[] = []
      if (l.price_sar != null) parts.push(`سعرها ${l.price_sar.toLocaleString()} ريال`)
      if (l.make_slug === 'toyota')       parts.push('تويوتا — صيانة وقطع غيار متوفرة وسعر إعادة بيع ممتاز')
      else if (l.make_slug === 'hyundai') parts.push('هيونداي — اقتصادية في الوقود والصيانة')
      else if (l.make_slug === 'kia')     parts.push('كيا — موثوقة بضمان طويل')
      else if (l.make_slug === 'honda')   parts.push('هوندا — متينة وصيانتها بسيطة')
      else if (l.make_slug === 'nissan')  parts.push('نيسان — اقتصادية في التشغيل')
      if (l.mileage_km != null && l.mileage_km < 120000) parts.push('ممشى مقبول لمستعملة')
      return parts.join(' · ') || 'خيار جيد لسائق جديد'
    },
  },
  {
    key: 'upgrade',
    emoji: '✨',
    titleAr: 'ترقية',
    blurbAr: 'فوق 100 ألف، سيارة تمثّل مكانتك بمواصفات وتقنيات حديثة.',
    accent: '#2A3D78',
    bg: 'linear-gradient(135deg, rgba(42,61,120,0.20) 0%, rgba(42,61,120,0.06) 100%)',
    reasoning: (l) => {
      const parts: string[] = []
      if (l.make_slug === 'mercedes-benz') parts.push('مرسيدس — راحة وفخامة بمعايير ألمانية')
      else if (l.make_slug === 'bmw')      parts.push('بي إم دبليو — أداء رياضي وتقنيات قيادة متقدمة')
      else if (l.make_slug === 'lexus')    parts.push('لكزس — موثوقية يابانية مع فخامة فاخرة')
      else if (l.make_slug === 'audi')     parts.push('أودي — تصميم نظيف وتقنيات متقدمة')
      else if (l.make_slug === 'porsche')  parts.push('بورش — أداء بمستوى فئة عالمية')
      else if (l.make_slug === 'land-rover') parts.push('لاند روفر — قيادة عالية الموقف ورفاهية الطرق الوعرة')
      else if (l.make_slug === 'genesis')  parts.push('جينيسيس — فخامة كورية بقيمة ممتازة')
      if (l.year && l.year >= 2022) parts.push(`موديل حديث ${l.year}`)
      if (l.mileage_km != null && l.mileage_km < 40000) parts.push('ممشى منخفض جداً')
      return parts.join(' · ') || 'ترقية مستحقة'
    },
  },
]

export default function MatchClient ({
  personas,
}: {
  personas: Record<PersonaKey, Listing[]>
}) {
  const [selected, setSelected] = useState<PersonaKey | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackStatus, setFeedbackStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const active = useMemo(() => PERSONAS.find(p => p.key === selected) ?? null, [selected])
  const listings = active ? personas[active.key] : []

  async function submitFeedback (e: React.FormEvent) {
    e.preventDefault()
    if (!feedbackText.trim()) return
    setFeedbackStatus('sending')
    try {
      const res = await fetch('/api/match-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona: selected, text: feedbackText.trim() }),
      })
      if (!res.ok) throw new Error('failed')
      setFeedbackStatus('sent')
      setFeedbackText('')
    } catch {
      setFeedbackStatus('error')
    }
  }

  return (
    <div dir="rtl" className="min-h-screen" style={{ background: '#FAF7F2' }}>
      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${NAVY} 0%, #1A2A4A 60%, ${NAVY} 100%)`,
        }}
      >
        <div className="max-w-screen-md mx-auto px-4 py-10 sm:py-14 text-center">
          <div className="text-5xl sm:text-6xl mb-3" aria-hidden>☕</div>
          <h1 className="font-bold text-2xl sm:text-3xl text-white leading-tight">
            هلا والله، أنا الخطّابة.
          </h1>
          <p className="mt-3 text-sm sm:text-base leading-relaxed" style={{ color: 'rgba(255,255,255,0.78)' }}>
            خبريني وش تبحثين عنه وأنا أرشّح لك أنسب السيارات في السوق.
          </p>
        </div>
      </section>

      {/* ── Persona cards ── */}
      <section className="max-w-screen-xl mx-auto px-4 -mt-6 sm:-mt-8 relative z-10">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {PERSONAS.map(p => {
            const isActive = selected === p.key
            return (
              <motion.button
                key={p.key}
                onClick={() => setSelected(p.key)}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="text-right rounded-2xl p-5 border focus:outline-none focus-visible:ring-2"
                style={{
                  background: p.bg,
                  borderColor: isActive ? p.accent : 'rgba(0,0,0,0.08)',
                  boxShadow: isActive
                    ? `0 12px 32px -16px ${p.accent}80`
                    : '0 4px 12px -8px rgba(0,0,0,0.18)',
                }}
                aria-pressed={isActive}
              >
                <div className="text-4xl mb-3" aria-hidden>{p.emoji}</div>
                <div className="font-bold text-lg" style={{ color: NAVY }}>{p.titleAr}</div>
                <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: 'rgba(10,22,40,0.66)' }}>
                  {p.blurbAr}
                </p>
                {isActive && (
                  <div
                    className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1"
                    style={{ background: p.accent, color: 'white' }}
                  >
                    ← شوفي الترشيحات
                  </div>
                )}
              </motion.button>
            )
          })}
        </div>
      </section>

      {/* ── Curated listings + per-card reasoning ── */}
      <AnimatePresence mode="wait">
        {active && (
          <motion.section
            key={active.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className="max-w-screen-xl mx-auto px-4 py-8 sm:py-10"
          >
            <div className="mb-5 flex items-baseline gap-2 flex-wrap">
              <h2 className="font-bold text-xl" style={{ color: NAVY }}>
                ترشيحاتي لـ <span style={{ color: active.accent }}>{active.titleAr}</span>
              </h2>
              <span className="text-sm" style={{ color: 'rgba(10,22,40,0.55)' }}>
                ({listings.length} {listings.length === 1 ? 'سيارة' : 'سيارات'})
              </span>
            </div>

            {listings.length === 0 ? (
              <div
                className="rounded-2xl p-6 text-center text-sm"
                style={{ background: 'white', color: 'rgba(10,22,40,0.65)' }}
              >
                ما لقيت سيارات تطابق هذي الفئة حالياً. جربي شخصية ثانية أو رجعي لاحقاً —
                إعلانات جديدة كل يوم.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {listings.map((l, i) => (
                  <div key={l.id} className="flex flex-col gap-2.5">
                    <ListingCard listing={l} lang="ar" index={i} />
                    <div
                      className="rounded-xl px-3.5 py-2.5 text-[12px] leading-relaxed border"
                      style={{
                        background: active.bg,
                        borderColor: `${active.accent}30`,
                        color: 'rgba(10,22,40,0.78)',
                      }}
                    >
                      <span className="font-bold" style={{ color: active.accent }}>الخطّابة: </span>
                      {active.reasoning(l)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── "This isn't quite me" capture ── */}
            <div
              className="mt-10 rounded-2xl p-5 sm:p-6 border"
              style={{
                background: 'white',
                borderColor: 'rgba(10,22,40,0.10)',
              }}
            >
              <h3 className="font-bold text-base" style={{ color: NAVY }}>
                هذا مو أنا تماماً
              </h3>
              <p className="mt-1.5 text-[13px]" style={{ color: 'rgba(10,22,40,0.62)' }}>
                خبّريني وش الفعلاً تبحثين عنه وأنا أتعلّم منكِ للنسخة الجاية.
              </p>
              <form onSubmit={submitFeedback} className="mt-3.5 flex flex-col gap-3">
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="مثال: أنا طالب جامعي وأبحث عن سيارة كهربائية رخيصة..."
                  rows={3}
                  maxLength={2000}
                  className="rounded-xl px-3.5 py-3 text-sm resize-none focus:outline-none focus:ring-2"
                  style={{
                    background: '#FAF7F2',
                    border: '1px solid rgba(10,22,40,0.12)',
                    color: NAVY,
                  }}
                />
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={!feedbackText.trim() || feedbackStatus === 'sending'}
                    className="rounded-xl px-4 py-2 font-bold text-sm transition-opacity disabled:opacity-40"
                    style={{ background: active.accent, color: 'white' }}
                  >
                    {feedbackStatus === 'sending' ? '... جاري الإرسال' : 'إرسال'}
                  </button>
                  {feedbackStatus === 'sent' && (
                    <span className="text-[12px] font-semibold" style={{ color: active.accent }}>
                      شكراً! وصلتني ✓
                    </span>
                  )}
                  {feedbackStatus === 'error' && (
                    <span className="text-[12px] font-semibold" style={{ color: '#B8336A' }}>
                      حصل خطأ، حاول مرة ثانية
                    </span>
                  )}
                </div>
              </form>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {!active && (
        <div className="max-w-screen-md mx-auto px-4 py-10 text-center">
          <p className="text-sm" style={{ color: 'rgba(10,22,40,0.55)' }}>
            اختاري شخصية فوق وأنا أرشّح لكِ أنسب السيارات.
          </p>
          <Link
            href="/browse"
            className="mt-4 inline-block text-[13px] font-semibold underline"
            style={{ color: NAVY }}
          >
            أو تصفّحي كل السوق
          </Link>
        </div>
      )}
    </div>
  )
}
