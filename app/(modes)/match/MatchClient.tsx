'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import type { Listing } from '@/lib/supabase'
import ListingCard from '@/app/components/ListingCard'

export type PersonaKey =
  // 7 personas after the trim: city_only merged into first_car,
  // investment dropped entirely. Keys stay stable so DB-side analytics on
  // match_feedback.persona_selected don't need a backfill.
  | 'big_family' | 'first_car' | 'upgrade'
  | 'long_trip'  | 'economical' | 'luxury' | 'adventure'

type Persona = {
  key: PersonaKey
  emoji: string
  titleAr: string
  descAr: string
  gradFrom: string
  gradTo:   string
  accent:   string   // darker of the two for hover/text accents
  reasoning: (l: Listing) => string
}

const NAVY = 'var(--text-primary)'   // slate-800 in new palette
const GOLD = 'var(--accent-primary)' // assistance panel now uses coral, not gold

// 7 personas (post-trim: city_only merged into first_car, investment dropped).
// Gradient pairs match the brief exactly.
const PERSONAS: Persona[] = [
  {
    key: 'big_family', emoji: '👨‍👩‍👧‍👦', titleAr: 'عائلة كبيرة',
    descAr: 'مساحة وأمان للجميع — 7 ركاب أو أكثر، تشغيل عملي يومي.',
    gradFrom: '#F472B6', gradTo: '#FB7185', accent: '#BE185D',
    reasoning: (l) => {
      const p: string[] = []
      if (l.body_type_slug === 'minivan') p.push('فان عائلي يستوعب 7+ ركاب')
      else if (l.body_type_slug === 'suv') p.push('SUV واسع يناسب العائلة')
      if (l.year && l.year >= 2020) p.push(`موديل ${l.year} بأنظمة أمان متطورة`)
      if (l.mileage_km != null && l.mileage_km < 80000) p.push('ممشى قليل')
      return p.join(' · ') || 'مناسبة للعائلة الكبيرة'
    },
  },
  {
    // 'first_car' absorbs the former 'city_only' persona — under 50k,
    // economical, easy to park in the city.
    key: 'first_car', emoji: '🌱', titleAr: 'أول سيارة',
    descAr: 'سعر معقول تحت 50 ألف، اقتصادية، سهلة الركن في المدينة.',
    gradFrom: '#A3E635', gradTo: '#65A30D', accent: '#3F6212',
    reasoning: (l) => {
      const p: string[] = []
      if (l.price_sar != null) p.push(`${l.price_sar.toLocaleString()} ريال`)
      const m = l.make_slug
      if (m === 'toyota')       p.push('تويوتا — صيانة بسيطة وقيمة إعادة بيع ممتازة')
      else if (m === 'hyundai') p.push('هيونداي — اقتصادية في الوقود والصيانة')
      else if (m === 'kia')     p.push('كيا — موثوقة بضمان طويل')
      else if (m === 'honda')   p.push('هوندا — متينة وصيانتها بسيطة')
      else if (m === 'nissan')  p.push('نيسان — اقتصادية في التشغيل')
      if (l.body_type_slug === 'hatchback') p.push('هاتشباك مدمجة سهلة الركن')
      return p.join(' · ') || 'خيار جيد لسائق جديد'
    },
  },
  {
    key: 'upgrade', emoji: '✨', titleAr: 'ترقية',
    descAr: 'فوق 100 ألف، مواصفات حديثة، حضور قوي.',
    gradFrom: '#FCD34D', gradTo: '#D97706', accent: '#92400E',
    reasoning: (l) => {
      const p: string[] = []
      const m = l.make_slug
      if (m === 'mercedes-benz') p.push('مرسيدس — راحة وفخامة بمعايير ألمانية')
      else if (m === 'bmw')      p.push('بي إم دبليو — أداء رياضي وتقنيات قيادة متقدمة')
      else if (m === 'lexus')    p.push('لكزس — موثوقية يابانية مع فخامة')
      else if (m === 'audi')     p.push('أودي — تصميم نظيف وتقنيات متقدمة')
      else if (m === 'porsche')  p.push('بورش — أداء بمستوى عالمي')
      else if (m === 'land-rover') p.push('لاند روفر — قيادة عالية ورفاهية')
      else if (m === 'genesis')  p.push('جينيسيس — فخامة كورية بقيمة ممتازة')
      if (l.year && l.year >= 2022) p.push(`موديل ${l.year}`)
      return p.join(' · ') || 'ترقية مستحقة'
    },
  },
  {
    key: 'long_trip', emoji: '🛣️', titleAr: 'سفر طويل',
    descAr: 'مريحة على المسافات الطويلة، ثابتة، اقتصاد وقود جيد.',
    gradFrom: '#60A5FA', gradTo: '#2563EB', accent: '#1D4ED8',
    reasoning: (l) => {
      const p: string[] = []
      if (l.body_type_slug === 'sedan') p.push('سيدان مريحة على الطرق السريعة')
      else if (l.body_type_slug === 'suv') p.push('SUV ثابتة على المسافات الطويلة')
      if (l.fuel_type_slug === 'hybrid' || l.fuel_type_slug === 'mild-hybrid') p.push('هجين موفّر للوقود')
      if (l.mileage_km != null && l.mileage_km < 80000) p.push('ممشى قليل')
      return p.join(' · ') || 'مناسبة للسفر الطويل'
    },
  },
  {
    key: 'economical', emoji: '💡', titleAr: 'اقتصادي',
    descAr: 'أقل تكلفة شراء وصيانة ممكنة، اعتمادية قبل كل شيء.',
    gradFrom: '#FBBF24', gradTo: '#B45309', accent: '#92400E',
    reasoning: (l) => {
      const p: string[] = []
      if (l.price_sar != null) p.push(`${l.price_sar.toLocaleString()} ريال فقط`)
      const m = l.make_slug
      if (m === 'toyota')        p.push('تويوتا — أقل تكلفة صيانة طويلة المدى')
      else if (m === 'hyundai')  p.push('هيونداي — اقتصادية ومتوفرة قطع الغيار')
      else if (m === 'suzuki')   p.push('سوزوكي — استهلاك وقود منخفض جداً')
      return p.join(' · ') || 'الأفضل قيمة مقابل المال'
    },
  },
  {
    key: 'luxury', emoji: '💎', titleAr: 'فخامة',
    descAr: 'فوق 200 ألف، علامات ممتازة، حالة مميزة.',
    gradFrom: '#F9A8D4', gradTo: '#BE185D', accent: '#9D174D',
    reasoning: (l) => {
      const p: string[] = []
      const m = l.make_slug
      if (m === 'rolls-royce')   p.push('رولز رويس — قمة الفخامة العالمية')
      else if (m === 'bentley')  p.push('بنتلي — صناعة يدوية بريطانية')
      else if (m === 'ferrari')  p.push('فيراري — أداء وأناقة إيطالية')
      else if (m === 'lamborghini') p.push('لامبورغيني — تصميم جريء وأداء ناري')
      else if (m === 'mercedes-benz') p.push('مرسيدس — فخامة كلاسيكية')
      else if (m === 'porsche')  p.push('بورش — رياضية فاخرة')
      if (l.year && l.year >= 2022) p.push(`موديل حديث ${l.year}`)
      if (l.mileage_km != null && l.mileage_km < 30000) p.push('ممشى ضئيل')
      return p.join(' · ') || 'فخامة من الدرجة الأولى'
    },
  },
  {
    key: 'adventure', emoji: '🏔️', titleAr: 'مغامرة',
    descAr: 'دفع رباعي، خروج بر، قدرات قوية على الطرق الوعرة.',
    gradFrom: '#FB923C', gradTo: '#C2410C', accent: '#9A3412',
    reasoning: (l) => {
      const p: string[] = []
      const m = l.make_slug
      if (m === 'toyota') p.push('تويوتا — أسطورة الطرق الوعرة')
      else if (m === 'jeep')       p.push('جيب — مصممة للمغامرة')
      else if (m === 'land-rover') p.push('لاند روفر — قدرات استثنائية على البر')
      else if (m === 'ford')       p.push('فورد — قوة وموثوقية في الطرق الوعرة')
      if (l.body_type_slug === 'pickup') p.push('بيك أب عملي')
      else if (l.body_type_slug === 'suv') p.push('SUV بقدرات رفع وعزم عالية')
      return p.join(' · ') || 'مناسبة لعشاق المغامرة'
    },
  },
]

export default function MatchClient ({
  personas,
}: {
  personas: Record<PersonaKey, Listing[]>
}) {
  const [selected, setSelected]       = useState<PersonaKey | null>(null)
  const [helpOpen, setHelpOpen]       = useState(false)
  const [helpStatus, setHelpStatus]   = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [helpEmail, setHelpEmail]     = useState('')
  const [helpText, setHelpText]       = useState('')

  const active = useMemo(() => PERSONAS.find(p => p.key === selected) ?? null, [selected])
  const listings = active ? personas[active.key] : []

  async function submitHelp (e: React.FormEvent) {
    e.preventDefault()
    if (!helpText.trim()) return
    setHelpStatus('sending')
    try {
      // Reuse the existing match_feedback table; capture email separately
      // into waitlist for follow-up when we ship the AI version.
      const tasks: Promise<Response>[] = [
        fetch('/api/match-feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ persona: null, text: helpText.trim() }),
        }),
      ]
      if (helpEmail.trim()) {
        tasks.push(fetch('/api/waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: helpEmail.trim(), mode: 'match_assist' }),
        }))
      }
      const results = await Promise.all(tasks)
      if (results.some(r => !r.ok)) throw new Error('failed')
      setHelpStatus('sent'); setHelpText(''); setHelpEmail('')
    } catch {
      setHelpStatus('error')
    }
  }

  return (
    <div dir="rtl" className="min-h-screen" style={{ background: 'var(--bg-page)' }}>
      {/* ── Top intro ── */}
      <section className="max-w-screen-xl mx-auto px-4 pt-16 pb-10 text-center">
        <div className="text-6xl leading-none" aria-hidden>☕</div>
        <h1
          className="mt-4 font-extrabold leading-tight"
          style={{ color: NAVY, fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 800 }}
        >
          هلا والله، أنا الخطّابة.
        </h1>
        <p
          className="mt-4 mx-auto max-w-xl"
          style={{ color: 'rgba(10,22,40,0.65)', fontSize: 16, fontWeight: 400 }}
        >
          خبّريني وش تبحثين عنه وأنا أرشّح لك أنسب السيارات.
        </p>
      </section>

      {/* ── Personas grid + assistance panel ──
          7 personas + 1 panel = 8 cells on a 3-column grid. Layout:
            Row 1: p1  p2  p3
            Row 2: p4  p5  p6
            Row 3: p7  ▷── panel spans cols 2-3 ──▷
          On <sm the grid collapses to one column and the panel falls
          naturally to the end. */}
      <section className="max-w-screen-xl mx-auto px-4 pb-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {PERSONAS.map(p => {
              const isActive = selected === p.key
              return (
                <motion.button
                  key={p.key}
                  onClick={() => setSelected(p.key)}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="text-right relative rounded-2xl bg-white border focus:outline-none focus-visible:ring-2 overflow-hidden"
                  style={{
                    height: 200,
                    borderColor: isActive ? p.accent : 'rgba(10,22,40,0.08)',
                    boxShadow: isActive
                      ? `0 14px 32px -16px ${p.accent}80`
                      : '0 2px 6px -3px rgba(10,22,40,0.10)',
                  }}
                  aria-pressed={isActive}
                >
                  {/* 12px gradient ribbon at top */}
                  <div
                    aria-hidden
                    className="absolute top-0 inset-x-0"
                    style={{
                      height: 12,
                      background: `linear-gradient(135deg, ${p.gradFrom} 0%, ${p.gradTo} 100%)`,
                    }}
                  />
                  <div className="p-4 pt-6 h-full flex flex-col">
                    <div
                      aria-hidden
                      className="leading-none"
                      style={{ fontSize: 48, marginBottom: 12 }}
                    >
                      {p.emoji}
                    </div>
                    <div
                      className="font-extrabold leading-tight"
                      style={{ color: NAVY, fontSize: 18, fontWeight: 800 }}
                    >
                      {p.titleAr}
                    </div>
                    <p
                      className="mt-2 leading-relaxed line-clamp-2"
                      style={{ color: 'rgba(10,22,40,0.62)', fontSize: 14 }}
                    >
                      {p.descAr}
                    </p>
                    {isActive && (
                      <div
                        className="mt-auto inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1 self-start"
                        style={{ background: p.accent, color: 'white' }}
                      >
                        ← شوفي الترشيحات
                      </div>
                    )}
                  </div>
                </motion.button>
              )
            })}

          {/* بشيلك أنا — assistance panel. Spans the remaining 2 columns of
              the bottom row on desktop so the grid finishes cleanly. */}
          <aside
            className="rounded-2xl p-5 sm:p-6 flex flex-col sm:col-span-1 lg:col-span-2"
            style={{
              minHeight: 200,
              background: 'linear-gradient(180deg, rgba(255,107,74,0.08) 0%, rgba(255,107,74,0.03) 100%)',
              border: '1px solid rgba(255,107,74,0.30)',
            }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
              style={{ background: 'rgba(255,107,74,0.14)' }}
              aria-hidden
            >
              <Sparkles className="w-5 h-5" style={{ color: GOLD }} strokeWidth={1.8} />
            </div>
            <h3
              className="leading-tight"
              style={{ color: NAVY, fontSize: 18, fontWeight: 800 }}
            >
              ما لقيتي اللي تبحثين عنه؟
            </h3>
            <p
              className="mt-2 leading-relaxed"
              style={{ color: 'rgba(10,22,40,0.62)', fontSize: 14 }}
            >
              جاوبي على 3 أسئلة وأنا أساعدك تلقين.
            </p>
            <button
              onClick={() => setHelpOpen(true)}
              className="mt-auto w-full rounded-xl py-2.5 font-extrabold text-sm transition-opacity hover:opacity-90"
              style={{ background: GOLD, color: '#FFFFFF', borderRadius: 12 }}
            >
              ابدأي معي
            </button>
          </aside>
        </div>

        {/* Single-line fallback link to Browse */}
        <div className="mt-10 text-center text-sm" style={{ color: 'rgba(10,22,40,0.55)' }}>
          أو{' '}
          <Link
            href="/browse"
            className="font-semibold underline"
            style={{ color: GOLD, textDecorationColor: `${GOLD}66` }}
          >
            تصفّحي كل السوق ←
          </Link>
        </div>
      </section>

      {/* ── Curated listings for the selected persona ── */}
      <AnimatePresence mode="wait">
        {active && (
          <motion.section
            key={active.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className="max-w-screen-xl mx-auto px-4 pb-12"
          >
            <div className="flex items-baseline gap-2 flex-wrap mb-5">
              <h2 className="font-extrabold text-xl" style={{ color: NAVY }}>
                ترشيحاتي لـ{' '}
                <span style={{ color: active.accent }}>{active.titleAr}</span>
              </h2>
              <span className="text-sm" style={{ color: 'rgba(10,22,40,0.55)' }}>
                ({listings.length} {listings.length === 1 ? 'سيارة' : 'سيارات'})
              </span>
            </div>

            {listings.length === 0 ? (
              <div className="rounded-2xl p-6 bg-white text-center text-sm" style={{ color: 'rgba(10,22,40,0.65)' }}>
                ما لقيت سيارات تطابق هذي الفئة حالياً. جربي شخصية ثانية —
                إعلانات جديدة كل يوم.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {listings.map((l, i) => (
                  <div key={l.id} className="flex flex-col gap-2.5">
                    <ListingCard listing={l} lang="ar" index={i} />
                    <div
                      className="rounded-xl px-3.5 py-2.5 text-[12px] leading-relaxed border"
                      style={{
                        background: `linear-gradient(135deg, ${active.gradFrom}18 0%, ${active.gradTo}10 100%)`,
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
          </motion.section>
        )}
      </AnimatePresence>

      {/* ── "بشيلك أنا" assist modal ── */}
      <AnimatePresence>
        {helpOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: 'rgba(10,22,40,0.6)' }}
            onClick={() => setHelpOpen(false)}
          >
            <motion.div
              initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 12, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl w-full max-w-md p-5 sm:p-6"
              style={{ borderRadius: 20 }}
            >
              <div className="flex items-center gap-2.5 mb-2">
                <Sparkles className="w-5 h-5" style={{ color: GOLD }} strokeWidth={1.8} />
                <h3 className="font-extrabold text-lg" style={{ color: NAVY }}>قوليلي أكثر</h3>
              </div>
              <p className="text-[13px] leading-relaxed mb-4" style={{ color: 'rgba(10,22,40,0.65)' }}>
                وش الفعلاً تبحثين عنه؟ كم الميزانية؟ كم شخص بتركبون عادة؟
                نسخة المحادثة الكاملة بتوصلك على الإيميل إذا تركتيه.
              </p>
              <form onSubmit={submitHelp} className="flex flex-col gap-3">
                <textarea
                  value={helpText}
                  onChange={e => setHelpText(e.target.value)}
                  placeholder="مثال: أبحث عن SUV عائلي تحت 80 ألف، 7 ركاب، استهلاك معقول..."
                  rows={4}
                  maxLength={2000}
                  className="rounded-xl px-3.5 py-3 text-sm resize-none focus:outline-none focus:ring-2"
                  style={{ background: '#FAF7F2', border: '1px solid rgba(10,22,40,0.12)', color: NAVY }}
                />
                <input
                  type="email"
                  inputMode="email"
                  dir="ltr"
                  value={helpEmail}
                  onChange={e => setHelpEmail(e.target.value)}
                  placeholder="email@example.com  (اختياري — لإشعاركِ بإطلاق المحادثة)"
                  className="rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2"
                  style={{ background: '#FAF7F2', border: '1px solid rgba(10,22,40,0.12)', color: NAVY }}
                />
                <div className="flex items-center gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => setHelpOpen(false)}
                    className="text-sm font-semibold px-3 py-2"
                    style={{ color: 'rgba(10,22,40,0.55)' }}
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={!helpText.trim() || helpStatus === 'sending'}
                    className="rounded-xl px-4 py-2 font-extrabold text-sm transition-opacity disabled:opacity-40"
                    style={{ background: GOLD, color: '#FFFFFF', borderRadius: 12 }}
                  >
                    {helpStatus === 'sending' ? '... جاري الإرسال' :
                     helpStatus === 'sent'    ? 'وصلتني ✓' : 'إرسال'}
                  </button>
                </div>
                {helpStatus === 'error' && (
                  <span className="text-[12px] font-semibold text-red-700">
                    حصل خطأ، حاول مرة ثانية
                  </span>
                )}
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
