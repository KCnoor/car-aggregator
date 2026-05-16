'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Target, AlertCircle, Scale, MousePointer2, Pin, Sparkles } from 'lucide-react'
import {
  ComposedChart, Scatter, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip, ReferenceArea,
} from 'recharts'
import type { Listing } from '@/lib/supabase'
import ListingCard from '@/app/components/ListingCard'
import { useLang } from '@/app/components/LangContext'
import { MODEL_COLORS } from './bundles'

const CORAL  = '#FF6B4A'
const NAVY_900 = '#0F172A'
const NAVY   = '#1E293B'
const SLATE_700 = '#334155'
const SLATE  = '#64748B'
const SLATE_400 = '#94A3B8'
const SLATE_300 = '#CBD5E1'
const SLATE_200 = '#E2E8F0'
const SLATE_100 = '#F1F5F9'
const SLATE_50  = '#F8FAFC'

const MAX_SLOTS = 5
const DEFAULT_YEAR_MIN = 2020
const DEFAULT_YEAR_MAX = 2024
const YEAR_OPTIONS = Array.from({ length: 2026 - 2005 + 1 }, (_, i) => 2026 - i)
const POINT_CAP = 120

export type SlotSpec = {
  make: string
  model: string
  yearMin: number
  yearMax: number
}

type Slot = SlotSpec | null

type CanonicalMake = {
  canonical_make_slug: string
  canonical_name_en: string
  canonical_name_ar: string
}
type CanonicalModel = {
  canonical_make_slug: string
  canonical_model_slug: string
  canonical_name_en: string
  canonical_name_ar: string
}

// Linear-interpolation percentile (the previous floor-indexed version
// effectively returned the MAX for samples of n < 20, which combined with
// data-entry-error outliers pinned the axes at absurd values like 1.5M km).
// For n elements the rank position of the p-th percentile is
// (p/100) * (n - 1), interpolating between the two surrounding sorted
// values.
function percentile (sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const rank = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(rank)
  const hi = Math.ceil(rank)
  if (lo === hi) return sorted[lo]
  const frac = rank - lo
  return sorted[lo] * (1 - frac) + sorted[hi] * frac
}
function median (sorted: number[]) {
  if (sorted.length === 0) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
function ticksForDomain (lo: number, hi: number, step: number): number[] {
  if (hi <= lo) return [lo]
  const start = Math.ceil(lo / step) * step
  const out: number[] = []
  for (let v = start; v <= hi; v += step) out.push(v)
  return out
}

export default function HuntClient ({
  initialSpecs,
  initialPerSlot,
  canonicalMakes,
  canonicalModels,
}: {
  initialSpecs: SlotSpec[]
  initialPerSlot: Listing[][]
  canonicalMakes: CanonicalMake[]
  canonicalModels: CanonicalModel[]
}) {
  const router = useRouter()
  const { lang } = useLang()

  // 5 fixed slots; each may hold a spec or be null.
  const [slots, setSlots] = useState<Slot[]>(() => {
    const seeded: Slot[] = Array(MAX_SLOTS).fill(null)
    initialSpecs.slice(0, MAX_SLOTS).forEach((s, i) => { seeded[i] = s })
    return seeded
  })
  // Server-fetched listings, indexed by filled-slot ORDER (not slot index).
  // We keep a separate per-slot map so reordering / nulling slots doesn't
  // shuffle the listings.
  const [perSlot, setPerSlot] = useState<Listing[][]>(initialPerSlot)
  const [pinned, setPinned]   = useState<string[]>([])
  const [hoverId, setHoverId] = useState<string | null>(null)

  // "Comparing 4+ models thins the chart" — soft amber warning above the
  // chart. Dismissable; dismissal persists only for this session
  // (sessionStorage), so a fresh visit re-surfaces the nudge.
  const [tooManyDismissed, setTooManyDismissed] = useState(false)
  useEffect(() => {
    try { setTooManyDismissed(window.sessionStorage.getItem('hunt_4plus_dismissed') === '1') } catch {}
  }, [])
  function dismissTooMany () {
    setTooManyDismissed(true)
    try { window.sessionStorage.setItem('hunt_4plus_dismissed', '1') } catch {}
  }

  // Reflect slot state in the URL on changes (skip the first mount —
  // the server already loaded the initial set for whatever URL we landed on).
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    const filled = slots.filter(Boolean) as SlotSpec[]
    if (filled.length === 0) {
      router.replace('/hunt', { scroll: false })
      return
    }
    const modelsQ = filled.map(s => `${s.make}-${s.model}`).join(',')
    const yearsQ  = filled.map(s => `${s.yearMin}-${s.yearMax}`).join(',')
    router.replace(`/hunt?models=${encodeURIComponent(modelsQ)}&years=${encodeURIComponent(yearsQ)}`, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots])

  // initialPerSlot changes whenever the server re-renders (URL changed) —
  // sync it into local state so subsequent client computations see fresh data.
  useEffect(() => { setPerSlot(initialPerSlot) }, [initialPerSlot])

  // ── Slot operations ────────────────────────────────────────────────────────
  function setSlot (idx: number, value: Slot) {
    setSlots(prev => {
      const next = [...prev]
      next[idx] = value
      return next
    })
    setPinned([])
  }
  function setSlotMake (idx: number, makeSlug: string | null) {
    setSlot(idx, makeSlug
      ? { make: makeSlug, model: '', yearMin: DEFAULT_YEAR_MIN, yearMax: DEFAULT_YEAR_MAX }
      : null)
  }
  function setSlotModel (idx: number, modelSlug: string | null) {
    setSlots(prev => {
      const cur = prev[idx]
      if (!cur) return prev
      const next = [...prev]
      next[idx] = { ...cur, model: modelSlug ?? '' }
      return next
    })
    setPinned([])
  }
  function setSlotYears (idx: number, yearMin: number, yearMax: number) {
    setSlots(prev => {
      const cur = prev[idx]
      if (!cur) return prev
      const next = [...prev]
      next[idx] = { ...cur, yearMin, yearMax }
      return next
    })
  }
  function togglePin (id: string) {
    setPinned(prev => prev.includes(id)
      ? prev.filter(p => p !== id)
      : (prev.length >= 4 ? prev : [...prev, id]))
  }

  // ── Group server listings to slot order (only for fully-filled slots) ──
  type SlotGroup = {
    color: string
    labelAr: string
    labelEn: string
    listings: Listing[]
    slotIndex: number
  }
  const slotGroups: SlotGroup[] = useMemo(() => {
    // Walk filled slots in order; `perSlot` indexes line up because the
    // server returns one array per filled slot in declaration order.
    const groups: SlotGroup[] = []
    let perSlotCursor = 0
    slots.forEach((s, idx) => {
      if (!s || !s.model) {
        // unfilled slot — skip listings but keep slot color reserved
        return
      }
      const cm = canonicalModels.find(c =>
        c.canonical_make_slug === s.make && c.canonical_model_slug === s.model)
      const mk = canonicalMakes.find(c => c.canonical_make_slug === s.make)
      const labelAr = cm && mk ? `${mk.canonical_name_ar} ${cm.canonical_name_ar}` : `${s.make} ${s.model}`
      const labelEn = cm && mk ? `${mk.canonical_name_en} ${cm.canonical_name_en}` : `${s.make} ${s.model}`
      groups.push({
        color: MODEL_COLORS[idx] ?? CORAL,
        labelAr, labelEn,
        listings: perSlot[perSlotCursor] ?? [],
        slotIndex: idx,
      })
      perSlotCursor++
    })
    return groups
  }, [slots, perSlot, canonicalMakes, canonicalModels])

  const hasAnyFullSlot = slotGroups.length > 0
  const allListings = useMemo(() => slotGroups.flatMap(g => g.listings), [slotGroups])

  // ── Chart geometry (dynamic ranges + percentile clip + medians) ──
  const chart = useMemo(() => {
    if (allListings.length === 0) {
      return {
        pointsByGroup: [] as ChartGroup[],
        xMin: 0, xMax: 1, yMin: 0, yMax: 1,
        xStep: 50_000, yStep: 50_000,
        xMid: 0, yMid: 0,
        clippedCount: 0, totalCount: 0,
      }
    }
    const prices = [...allListings.map(l => l.price_sar!).filter(Number.isFinite)].sort((a, b) => a - b)
    const miles  = [...allListings.map(l => l.mileage_km!).filter(Number.isFinite)].sort((a, b) => a - b)

    // Dynamic axis ranges:
    //   min = max(0, floor(rawMin * 0.9 / step) * step)
    //   max = ceil(p95 * 1.1 / step) * step
    // Step is chosen from the visible range so ticks are tidy:
    //   < 25k spread → 10k step
    //   < 200k spread → 25k step
    //   else        → 50k step
    function dynamicAxis (vals: number[]) {
      const rawMin = vals[0]
      const p95    = percentile(vals, 95)
      const spread = Math.max(1, p95 - rawMin)
      const step = spread <= 25_000  ? 10_000
                 : spread <= 200_000 ? 25_000
                 :                     50_000
      const min = Math.max(0, Math.floor((rawMin * 0.9) / step) * step)
      const max = Math.ceil ((p95   * 1.1) / step) * step
      return { min, max: Math.max(max, min + step), step }
    }

    const x = dynamicAxis(prices)
    const y = dynamicAxis(miles)

    const inRange = (l: Listing) =>
      l.price_sar!  >= x.min && l.price_sar!  <= x.max &&
      l.mileage_km! >= y.min && l.mileage_km! <= y.max

    const pointsByGroup: ChartGroup[] = slotGroups.map(g => {
      const data = g.listings
        .filter(inRange)
        .map(l => ({ x: l.price_sar!, y: l.mileage_km!, id: l.id, listing: l }))
      return { color: g.color, label: lang === 'ar' ? g.labelAr : g.labelEn, data }
    })
    const totalInRange = pointsByGroup.reduce((a, m) => a + m.data.length, 0)
    if (totalInRange > POINT_CAP) {
      const ranked = pointsByGroup.flatMap(m =>
        m.data.map(d => ({ id: d.id, score: d.listing.deal_score ?? -1 }))
      ).sort((a, b) => b.score - a.score).slice(0, POINT_CAP)
      const keep = new Set(ranked.map(r => r.id))
      for (const m of pointsByGroup) m.data = m.data.filter(d => keep.has(d.id))
    }
    const renderedPrices = pointsByGroup.flatMap(m => m.data.map(d => d.x)).sort((a, b) => a - b)
    const renderedMiles  = pointsByGroup.flatMap(m => m.data.map(d => d.y)).sort((a, b) => a - b)
    return {
      pointsByGroup,
      xMin: x.min, xMax: x.max, yMin: y.min, yMax: y.max,
      xStep: x.step, yStep: y.step,
      xMid: median(renderedPrices), yMid: median(renderedMiles),
      clippedCount: allListings.length - totalInRange,
      totalCount: allListings.length,
    }
  }, [allListings, slotGroups, lang])

  const totalRendered = chart.pointsByGroup.reduce((a, m) => a + m.data.length, 0)
  const clippedOutOfChart = chart.totalCount - totalRendered

  // Listings strip data: pinned set if any, else everything in-chart.
  const stripIds = useMemo(() => {
    if (pinned.length > 0) return pinned
    return chart.pointsByGroup.flatMap(g => g.data.map(d => d.id))
  }, [pinned, chart])
  const stripListings: Listing[] = useMemo(() => {
    const idSet = new Set(stripIds)
    return allListings
      .filter(l => idSet.has(l.id))
      .sort((a, b) => (b.deal_score ?? -1) - (a.deal_score ?? -1))
  }, [stripIds, allListings])

  return (
    <div dir="rtl" className="min-h-screen" style={{ background: 'var(--bg-page)' }}>
      {/* ── Intro strip + tips panel ── */}
      <section className="max-w-screen-xl mx-auto px-4" style={{ paddingTop: 40, paddingBottom: 24 }}>
        <div className="grid grid-cols-1 md:grid-cols-[55fr_45fr] gap-6">
          {/* Title column (right under RTL) */}
          <div>
            <h1 className="leading-tight" style={{ color: NAVY_900, fontSize: 40, fontWeight: 900 }}>
              الصياد
            </h1>
            <p className="mt-3" style={{ color: SLATE_700, fontSize: 20, fontWeight: 600 }}>
              تعرف وش تبي، بس تدور اللقطة.
            </p>
            <p className="mt-2 max-w-prose" style={{ color: SLATE, fontSize: 16, lineHeight: 1.7 }}>
              اختر حتى ٥ موديلات في الخانات تحت، وشوف على المخطط وين السيارات الأرخص
              والممشى الأقل. حوم على نقطة لتفاصيلها، اضغط لتثبيتها.
            </p>
          </div>

          {/* Tips column (left under RTL — stacks below on mobile) */}
          <UsageTips />
        </div>
      </section>

      {/* ── 5 slot cards ── */}
      <section className="max-w-screen-xl mx-auto px-4 pb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {slots.map((slot, idx) => (
            <SlotCard
              key={idx}
              slotIndex={idx}
              slot={slot}
              color={MODEL_COLORS[idx]}
              canonicalMakes={canonicalMakes}
              canonicalModels={canonicalModels}
              onPickMake={make => setSlotMake(idx, make)}
              onPickModel={model => setSlotModel(idx, model)}
              onPickYears={(lo, hi) => setSlotYears(idx, lo, hi)}
              onClear={() => setSlot(idx, null)}
            />
          ))}
        </div>
      </section>

      {/* ── 4-plus-models soft warning. Only renders when the user has
          filled 4 or 5 slots AND hasn't dismissed it this session. ── */}
      {slotGroups.length >= 4 && !tooManyDismissed && (
        <section className="mx-auto px-4 pb-4" style={{ maxWidth: 1100 }}>
          <TooManyModelsBanner onDismiss={dismissTooMany} />
        </section>
      )}

      {/* ── Chart ── */}
      <section className="mx-auto px-4 pb-5" style={{ maxWidth: 1100 }}>
        <div
          className="rounded-2xl"
          style={{
            background: '#FFFFFF',
            border: `1px solid ${SLATE_200}`,
            padding: 16,
            boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
          }}
        >
          {/* Legend (right-aligned in RTL) */}
          {hasAnyFullSlot && (
            <div className="flex flex-wrap justify-end mb-3" style={{ gap: 24 }}>
              {slotGroups.map(g => (
                <span key={g.slotIndex} className="inline-flex items-center gap-2">
                  <span aria-hidden style={{ width: 12, height: 12, borderRadius: 999, background: g.color }} />
                  <span style={{ color: NAVY_900, fontWeight: 800, fontSize: 15 }}>
                    {lang === 'ar' ? g.labelAr : g.labelEn}
                  </span>
                  <span style={{ color: SLATE, fontWeight: 500, fontSize: 13 }}>
                    ({g.listings.length})
                  </span>
                </span>
              ))}
            </div>
          )}

          {!hasAnyFullSlot ? (
            <EmptyState />
          ) : totalRendered < 1 ? (
            <div
              className="flex items-center justify-center text-center"
              style={{ height: 360, color: SLATE, fontSize: 14 }}
            >
              ما لقينا سيارات في هذا المدى. وسّع السنوات أو غيّر الموديلات.
            </div>
          ) : (
            <HuntChart
              groups={chart.pointsByGroup}
              xMin={chart.xMin} xMax={chart.xMax}
              yMin={chart.yMin} yMax={chart.yMax}
              xStep={chart.xStep} yStep={chart.yStep}
              xMid={chart.xMid} yMid={chart.yMid}
              hoverId={hoverId}
              pinned={pinned}
              onHover={setHoverId}
              onClick={togglePin}
              reversedX={lang === 'ar'}
              offChartCount={clippedOutOfChart}
              lang={lang}
            />
          )}
        </div>
      </section>

      {/* ── Listings strip ── */}
      {hasAnyFullSlot && totalRendered > 0 && (
        <section className="max-w-screen-xl mx-auto px-4 pb-12">
          <div
            className="rounded-2xl"
            style={{
              background: SLATE_50,
              padding: 16,
              marginBottom: 16,
              color: SLATE_700,
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            <span aria-hidden style={{ marginInlineEnd: 8 }}>👇</span>
            السيارات في المخطط ({stripListings.length} سيارة)
            {pinned.length > 0
              ? <> · <button onClick={() => setPinned([])} className="underline" style={{ color: CORAL }}>عرض كل السيارات</button></>
              : <> — مرتبة حسب أحسن صفقة</>}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stripListings.map((l, i) => {
              const matchingGroup = slotGroups.find(g =>
                g.listings.some(x => x.id === l.id)
              )
              const color = matchingGroup?.color ?? CORAL
              return (
                <div key={l.id} style={{ borderInlineStart: `4px solid ${color}`, paddingInlineStart: 8 }}>
                  <ListingCard listing={l} lang="ar" index={i} />
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

// ── Empty state ──────────────────────────────────────────────────────────────
// ── Soft amber warning when 4+ slots are filled ──────────────────────────────
function TooManyModelsBanner ({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl"
      style={{
        background: '#FFFBEB',
        borderInlineStart: '4px solid #F59E0B',
        padding: '12px 16px',
        color: '#92400E',
      }}
    >
      {/* Icon on the right under RTL (first DOM child = right visually) */}
      <AlertCircle size={20} color="#D97706" strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
      <p className="flex-1" style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.65 }}>
        ملاحظة: نقترح مقارنة ٣ موديلات أو أقل من نفس الفئة. كل ما تضيف موديلات
        مختلفة الحجم أو السعر، كل ما يصير المخطط أقل دقّة.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="إغلاق"
        className="rounded-full w-7 h-7 inline-flex items-center justify-center hover:bg-amber-100 transition-colors flex-shrink-0"
        style={{ color: '#92400E', fontSize: 18, lineHeight: 1 }}
      >
        ×
      </button>
    </div>
  )
}

// ── Usage tips panel beside the title ────────────────────────────────────────
function UsageTips () {
  const TIPS: { Icon: typeof Scale; text: string }[] = [
    { Icon: Scale,         text: 'قارن سيارات من نفس الفئة (مو رولز رويس مع كورولا)' },
    { Icon: Target,        text: 'النتيجة الأوضح بـ ٣ موديلات أو أقل' },
    { Icon: MousePointer2, text: 'حوم على نقطة لتفاصيل السيارة' },
    { Icon: Pin,           text: 'اضغط لتثبيت سيارة للمقارنة' },
    { Icon: Sparkles,      text: 'انتبه وتأكد من اللقطات لا يكونوا قفطات 😉' },
  ]
  return (
    <aside
      className="rounded-2xl"
      style={{
        background: SLATE_50,
        border: `1px solid ${SLATE_200}`,
        padding: 20,
      }}
    >
      <h3
        className="mb-3"
        style={{ color: SLATE_700, fontSize: 14, fontWeight: 800 }}
      >
        كيف تستخدم الصياد؟
      </h3>
      <ul className="flex flex-col gap-2.5" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {TIPS.map(({ Icon, text }, i) => (
          <li
            key={i}
            className="flex items-start gap-2.5"
            style={{ color: '#1E293B', fontSize: 14, fontWeight: 600, lineHeight: 1.55 }}
          >
            <Icon size={20} color={CORAL} strokeWidth={1.9} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}

function EmptyState () {
  return (
    <div
      className="flex flex-col items-center justify-center text-center px-4"
      style={{ height: 360 }}
    >
      <Target size={72} strokeWidth={1.2} color={CORAL} style={{ opacity: 0.18, marginBottom: 14 }} />
      <p style={{ color: SLATE_700, fontSize: 17, fontWeight: 600 }}>
        اختر ماركة وموديل في الخانات أعلاه لتشوف المخطط
      </p>
      <p className="mt-1" style={{ color: SLATE, fontSize: 13 }}>
        يمكنك اختيار حتى ٥ موديلات للمقارنة، كل واحد بنطاق سنوات خاص فيه
      </p>
    </div>
  )
}

// ── Slot card ────────────────────────────────────────────────────────────────
function SlotCard ({
  slotIndex,
  slot,
  color,
  canonicalMakes,
  canonicalModels,
  onPickMake,
  onPickModel,
  onPickYears,
  onClear,
}: {
  slotIndex: number
  slot: Slot
  color: string
  canonicalMakes: CanonicalMake[]
  canonicalModels: CanonicalModel[]
  onPickMake: (slug: string | null) => void
  onPickModel: (slug: string | null) => void
  onPickYears: (lo: number, hi: number) => void
  onClear: () => void
}) {
  const filled = !!slot?.make
  const fullyFilled = !!(slot?.make && slot?.model)
  const modelsForMake = slot?.make
    ? canonicalModels.filter(m => m.canonical_make_slug === slot.make)
    : []
  const yearMin = slot?.yearMin ?? DEFAULT_YEAR_MIN
  const yearMax = slot?.yearMax ?? DEFAULT_YEAR_MAX

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 16,
        borderTop:    `1px ${filled ? 'solid' : 'dashed'} ${filled ? SLATE_200 : SLATE_200}`,
        borderInlineEnd:  `1px ${filled ? 'solid' : 'dashed'} ${SLATE_200}`,
        borderBottom: `1px ${filled ? 'solid' : 'dashed'} ${SLATE_200}`,
        // RTL: insetInlineStart = left visually under dir=rtl on parent; in LTR = right.
        // But the spec says "left border in slot color" — semantically it should
        // be on the leading edge of the card. Use borderInlineStart so it
        // auto-flips with the document direction.
        borderInlineStart: `4px ${filled ? 'solid' : 'dashed'} ${filled ? color : `${color}80`}`,
        padding: 12,
        minHeight: 130,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        boxShadow: filled ? '0 2px 8px rgba(15,23,42,0.04)' : 'none',
        opacity: filled ? 1 : 0.92,
      }}
    >
      {/* Slot label + clear */}
      <div className="flex items-center justify-between">
        <span style={{ color: SLATE, fontSize: 13, fontWeight: 700 }}>
          موديل {slotIndex + 1}{slotIndex >= 3 && <span style={{ color: SLATE_400, fontWeight: 500 }}> (إضافي)</span>}
        </span>
        {fullyFilled && (
          <button
            type="button"
            onClick={onClear}
            aria-label="مسح"
            className="inline-flex items-center justify-center rounded-full w-5 h-5 hover:bg-slate-100"
            style={{ color: SLATE, fontSize: 14 }}
          >
            ×
          </button>
        )}
      </div>

      {/* Make dropdown */}
      <select
        value={slot?.make ?? ''}
        onChange={e => onPickMake(e.target.value || null)}
        style={{
          background: '#FFFFFF',
          border: `1px solid ${SLATE_200}`,
          borderRadius: 8,
          padding: '6px 10px',
          fontSize: 13,
          fontWeight: 600,
          color: slot?.make ? NAVY : SLATE_400,
          width: '100%',
        }}
      >
        <option value="">الماركة</option>
        {canonicalMakes.map(m => (
          <option key={m.canonical_make_slug} value={m.canonical_make_slug}>
            {m.canonical_name_ar}
          </option>
        ))}
      </select>

      {/* Model dropdown (disabled until make picked) */}
      <select
        value={slot?.model ?? ''}
        onChange={e => onPickModel(e.target.value || null)}
        disabled={!slot?.make}
        style={{
          background: !slot?.make ? SLATE_50 : '#FFFFFF',
          border: `1px solid ${SLATE_200}`,
          borderRadius: 8,
          padding: '6px 10px',
          fontSize: 13,
          fontWeight: 600,
          color: slot?.model ? NAVY : SLATE_400,
          width: '100%',
          cursor: slot?.make ? 'pointer' : 'not-allowed',
        }}
      >
        <option value="">الموديل</option>
        {modelsForMake.map(m => (
          <option key={m.canonical_model_slug} value={m.canonical_model_slug}>
            {m.canonical_name_ar}
          </option>
        ))}
      </select>

      {/* Per-slot year range */}
      <div className="flex items-center gap-1.5">
        <select
          value={yearMin}
          onChange={e => onPickYears(parseInt(e.target.value), Math.max(yearMax, parseInt(e.target.value)))}
          disabled={!fullyFilled}
          aria-label="من"
          style={{
            background: !fullyFilled ? SLATE_50 : '#FFFFFF',
            border: `1px solid ${SLATE_200}`,
            borderRadius: 8,
            padding: '4px 6px',
            fontSize: 12,
            fontWeight: 700,
            color: NAVY,
            flex: 1,
          }}
        >
          {YEAR_OPTIONS.map(y => (
            <option key={y} value={y}>من {y}</option>
          ))}
        </select>
        <select
          value={yearMax}
          onChange={e => onPickYears(Math.min(yearMin, parseInt(e.target.value)), parseInt(e.target.value))}
          disabled={!fullyFilled}
          aria-label="إلى"
          style={{
            background: !fullyFilled ? SLATE_50 : '#FFFFFF',
            border: `1px solid ${SLATE_200}`,
            borderRadius: 8,
            padding: '4px 6px',
            fontSize: 12,
            fontWeight: 700,
            color: NAVY,
            flex: 1,
          }}
        >
          {YEAR_OPTIONS.filter(y => y >= yearMin).map(y => (
            <option key={y} value={y}>إلى {y}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

// ── Chart ────────────────────────────────────────────────────────────────────
type ChartGroup = {
  color: string
  label: string
  data: { x: number; y: number; id: string; listing: Listing }[]
}

function HuntChart ({
  groups, xMin, xMax, yMin, yMax, xStep, yStep, xMid, yMid,
  hoverId, pinned, onHover, onClick, reversedX,
  offChartCount, lang,
}: {
  groups: ChartGroup[]
  xMin: number; xMax: number; yMin: number; yMax: number
  xStep: number; yStep: number
  xMid: number; yMid: number
  hoverId: string | null
  pinned: string[]
  onHover: (id: string | null) => void
  onClick: (id: string) => void
  reversedX: boolean
  offChartCount: number
  lang: 'ar' | 'en'
}) {
  const anyHover = hoverId !== null
  const dotShape = useCallback((props: { cx?: number; cy?: number; payload?: { id: string }; fill?: string }) => {
    const { cx, cy, payload, fill } = props
    if (cx == null || cy == null || !payload) return <g />
    const id = payload.id
    const isHover  = hoverId === id
    const isPinned = pinned.includes(id)
    const r = isHover ? 14 : 9
    const fillOpacity = anyHover ? (isHover ? 1 : 0.25) : 1
    return (
      <g
        style={{ cursor: 'pointer', transition: 'r 0.18s' }}
        onMouseEnter={() => onHover(id)}
        onMouseLeave={() => onHover(null)}
        onClick={() => onClick(id)}
      >
        <circle
          cx={cx} cy={cy} r={r}
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={isPinned ? CORAL : '#FFFFFF'}
          strokeWidth={isPinned ? 3 : 1}
        />
      </g>
    )
  }, [hoverId, pinned, anyHover, onHover, onClick])

  const xTicks = ticksForDomain(xMin, xMax, xStep)
  const yTicks = ticksForDomain(yMin, yMax, yStep)
  const fmt = (v: number) => v.toLocaleString('en-US')

  // Pill copy by language. The four pills always sit in the four
  // corners of the chart frame; CSS logical properties handle the RTL
  // flip so each pill always lands in the corner that matches its zone.
  const pills = lang === 'ar'
    ? {
        deal:    'منطقة اللقطات',
        bottomS: 'سعر أعلى، ممشى أقل',
        topS:    'سعر أقل، ممشى أعلى',
        avoid:   'أعلى من السوق',
      }
    : {
        deal:    'Deal zone',
        bottomS: 'Higher price, lower km',
        topS:    'Lower price, higher km',
        avoid:   'Above market',
      }
  const xTitle = lang === 'ar' ? 'السعر (ريال) →' : '← Price (SAR)'
  const yTitle = lang === 'ar' ? '↑ الممشى (كم)'   : '↑ Mileage (km)'

  return (
    <div className="hunt-plot-wrap relative" style={{ width: '100%' }}>
      <style>{`
        .hunt-plot       { height: 480px; }
        @media (max-width: 767px) {
          .hunt-plot     { height: 360px; }
        }
      `}</style>

      {/* Y axis title above the chart frame, on the trailing edge in RTL */}
      <div
        className="flex"
        style={{
          color: NAVY_900, fontSize: 18, fontWeight: 800,
          marginBottom: 8,
          justifyContent: 'flex-start',
        }}
      >
        {yTitle}
      </div>

      {/* The chart frame: 1px slate-300 border + 24px internal padding so
          dots never touch the edge. Position:relative so the corner pills
          can be absolutely positioned over the plot. */}
      <div
        className="relative"
        style={{
          border: `1px solid ${SLATE_300}`,
          borderRadius: 12,
          padding: 24,
          background: '#FFFFFF',
        }}
      >
        <div className="hunt-plot" style={{ width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart margin={{ top: 12, right: 16, bottom: 12, left: 16 }}>
              <CartesianGrid stroke={SLATE_100} strokeWidth={1} strokeDasharray="0" />

              {/* 4 quadrant backgrounds split at the medians. Same x1/y1
                  numerics for both AR and EN; Recharts handles the flip
                  visually because XAxis is `reversed` when AR. */}
              {xMid > 0 && yMid > 0 && (
                <>
                  <ReferenceArea x1={xMin} x2={xMid} y1={yMin} y2={yMid} fill="#ECFDF5" fillOpacity={1} stroke="none" />
                  <ReferenceArea x1={xMid} x2={xMax} y1={yMin} y2={yMid} fill="#F8FAFC" fillOpacity={1} stroke="none" />
                  <ReferenceArea x1={xMin} x2={xMid} y1={yMid} y2={yMax} fill="#FFFBEB" fillOpacity={1} stroke="none" />
                  <ReferenceArea x1={xMid} x2={xMax} y1={yMid} y2={yMax} fill="#FFF1F2" fillOpacity={1} stroke="none" />
                </>
              )}

              <XAxis
                type="number" dataKey="x"
                domain={[xMin, xMax]}
                ticks={xTicks}
                tickFormatter={fmt}
                tick={{ fill: SLATE_700, fontSize: 14, fontWeight: 700 }}
                stroke={SLATE_300}
                strokeWidth={2}
                tickLine={{ stroke: SLATE_400, strokeWidth: 1 }}
                tickSize={6}
                tickMargin={8}
                reversed={reversedX}
                allowDataOverflow={false}
              />
              <YAxis
                type="number" dataKey="y"
                domain={[yMin, yMax]}
                ticks={yTicks}
                tickFormatter={fmt}
                tick={{ fill: SLATE_700, fontSize: 14, fontWeight: 700 }}
                stroke={SLATE_300}
                strokeWidth={2}
                tickLine={{ stroke: SLATE_400, strokeWidth: 1 }}
                tickSize={6}
                tickMargin={8}
                width={64}
                allowDataOverflow={false}
                orientation={reversedX ? 'right' : 'left'}
              />
              <Tooltip cursor={false} content={<ChartTooltip />} wrapperStyle={{ outline: 'none', zIndex: 30 }} />
              {groups.map((g, i) => (
                <Scatter
                  key={`sc-${i}`}
                  data={g.data}
                  fill={g.color}
                  isAnimationActive={false}
                  shape={dotShape}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* 4 corner pills, always above dots.
            Position logic relies on CSS logical properties so the same
            insetInlineStart / End values land in the visually-correct
            corner under RTL and LTR.
              deal  = low x + low y  → bottom + insetInlineStart
              ↔ slate = high x + low y → bottom + insetInlineEnd
              amber = low x + high y → top    + insetInlineStart
              avoid = high x + high y → top    + insetInlineEnd
        */}
        {xMid > 0 && yMid > 0 && (
          <>
            <CornerPill text={pills.deal}    color="#047857" pos={{ bottom: 12, insetInlineStart: 16 }} />
            <CornerPill text={pills.bottomS} color={SLATE_700} pos={{ bottom: 12, insetInlineEnd: 16 }} />
            <CornerPill text={pills.topS}    color="#B45309" pos={{ top: 12, insetInlineStart: 16 }} />
            <CornerPill text={pills.avoid}   color="#BE123C" pos={{ top: 12, insetInlineEnd: 16 }} />
          </>
        )}

        {/* Off-chart indicator — bottom-right inside the frame (visual
            "off-screen toward higher values" in RTL). */}
        {offChartCount > 0 && (
          <span
            style={{
              position: 'absolute',
              bottom: 8, insetInlineEnd: 24,
              color: SLATE, fontSize: 11, fontWeight: 600,
              background: 'rgba(255,255,255,0.92)',
              padding: '2px 8px',
              borderRadius: 999,
              pointerEvents: 'none',
              zIndex: 25,
            }}
          >
            {offChartCount} {lang === 'ar' ? 'سيارة خارج المخطط →' : `cars off-chart →`}
          </span>
        )}
      </div>

      {/* X axis title below the frame */}
      <div
        className="flex"
        style={{
          color: NAVY_900, fontSize: 18, fontWeight: 800,
          marginTop: 12,
          justifyContent: 'center',
        }}
      >
        {xTitle}
      </div>
    </div>
  )
}

// ── Corner pill helper ──────────────────────────────────────────────────────
type PillPos = {
  top?: number | string
  bottom?: number | string
  insetInlineStart?: number | string
  insetInlineEnd?: number | string
}
function CornerPill ({ text, color, pos }: { text: string; color: string; pos: PillPos }) {
  return (
    <span
      style={{
        position: 'absolute',
        background: '#FFFFFF',
        border: `2px solid ${color}`,
        borderRadius: 12,
        padding: '8px 14px',
        color,
        fontSize: 13,
        fontWeight: 800,
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        whiteSpace: 'nowrap',
        zIndex: 20,
        pointerEvents: 'none',
        ...pos,
      }}
    >
      {text}
    </span>
  )
}

// ── Tooltip ──────────────────────────────────────────────────────────────────
function ChartTooltip ({ active, payload }: { active?: boolean; payload?: Array<{ payload?: { listing: Listing } }> }) {
  if (!active || !payload || !payload.length) return null
  const l = payload[0]?.payload?.listing
  if (!l) return null
  const photo = (l.photo_urls?.[0]) ?? null
  return (
    <div
      role="tooltip"
      style={{
        background: '#FFFFFF',
        border: `1px solid ${SLATE_200}`,
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(15,23,42,0.10)',
        padding: 10,
        display: 'flex',
        gap: 10,
        maxWidth: 280,
      }}
    >
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt=""
          width={60}
          height={60}
          style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
          referrerPolicy="no-referrer"
        />
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: NAVY, fontWeight: 800 }} dir="auto">
          {l.year} {l.make_ar ?? l.make_en} {l.model_ar ?? l.model_en}
        </div>
        <div style={{ fontSize: 13, color: NAVY, fontWeight: 900, marginTop: 2, direction: 'ltr', textAlign: 'right' }}>
          {l.price_sar?.toLocaleString()} <span style={{ fontSize: 10, color: SLATE, fontWeight: 600 }}>ريال</span>
        </div>
        <div style={{ fontSize: 11, color: SLATE, marginTop: 2 }} dir="auto">
          {l.mileage_km?.toLocaleString()} كم · {l.city_ar ?? l.city_en ?? '-'} · {l.source}
        </div>
      </div>
    </div>
  )
}
