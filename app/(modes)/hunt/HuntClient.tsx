'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Target } from 'lucide-react'
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

function percentile (sorted: number[], p: number) {
  if (sorted.length === 0) return 0
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)))
  return sorted[i]
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

  // ── Chart geometry (percentile clip + medians) ──
  const chart = useMemo(() => {
    if (allListings.length === 0) {
      return {
        pointsByGroup: [] as ChartGroup[],
        xMax: 1, yMax: 1, xMid: 0, yMid: 0,
        clippedCount: 0, totalCount: 0,
      }
    }
    const prices = [...allListings.map(l => l.price_sar!).filter(Number.isFinite)].sort((a, b) => a - b)
    const miles  = [...allListings.map(l => l.mileage_km!).filter(Number.isFinite)].sort((a, b) => a - b)
    // 95th-percentile clip on both axes; domain starts at 0.
    const xMax = percentile(prices, 95) * 1.05
    const yMax = percentile(miles, 95) * 1.05
    const inRange = (l: Listing) =>
      l.price_sar! >= 0 && l.price_sar! <= xMax &&
      l.mileage_km! >= 0 && l.mileage_km! <= yMax
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
      pointsByGroup, xMax, yMax,
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
      {/* ── Intro strip ── */}
      <section className="max-w-screen-xl mx-auto px-4" style={{ paddingTop: 40, paddingBottom: 24 }}>
        <h1 className="leading-tight" style={{ color: NAVY_900, fontSize: 40, fontWeight: 900 }}>
          الصياد
        </h1>
        <p className="mt-3" style={{ color: SLATE_700, fontSize: 20, fontWeight: 600 }}>
          تعرف وش تبي، بس تدور اللقطة.
        </p>
        <p className="mt-2 max-w-3xl" style={{ color: SLATE, fontSize: 16, lineHeight: 1.7 }}>
          اختر حتى ٥ موديلات في الخانات تحت، وشوف على المخطط وين السيارات الأرخص
          والممشى الأقل. حوم على نقطة لتفاصيلها، اضغط لتثبيتها.
        </p>
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
              xMax={chart.xMax}
              yMax={chart.yMax}
              xMid={chart.xMid}
              yMid={chart.yMid}
              hoverId={hoverId}
              pinned={pinned}
              onHover={setHoverId}
              onClick={togglePin}
              reversedX={lang === 'ar'}
            />
          )}

          {clippedOutOfChart > 0 && hasAnyFullSlot && (
            <div className="mt-2 text-center text-[12px]" style={{ color: SLATE }}>
              {clippedOutOfChart} سيارة خارج المخطط (أعلى من النسبة ٩٥٪)
            </div>
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
          موديل {slotIndex + 1}
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
  groups, xMax, yMax, xMid, yMid,
  hoverId, pinned, onHover, onClick, reversedX,
}: {
  groups: ChartGroup[]
  xMax: number; yMax: number
  xMid: number; yMid: number
  hoverId: string | null
  pinned: string[]
  onHover: (id: string | null) => void
  onClick: (id: string) => void
  reversedX: boolean
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

  const xTicks = ticksForDomain(0, xMax, 50_000)
  const yTicks = ticksForDomain(0, yMax, 50_000)
  const fmt = (v: number) => v.toLocaleString('en-US')

  return (
    <div
      className="relative"
      style={{
        width: '100%',
        height: 480,
      }}
    >
      <style>{`
        @media (max-width: 767px) {
          .hunt-plot { height: 360px; }
        }
      `}</style>
      <div className="hunt-plot" style={{ width: '100%', height: '100%' }}>
        {/* Axis labels.
            Deal corner = low x, low y. In RTL we want it bottom-right
            visually; in LTR bottom-left. Use logical properties so the
            corners auto-flip with the document direction. */}
        <span
          style={{
            position: 'absolute', top: 4, insetInlineStart: 4,
            color: NAVY_900, fontSize: 16, fontWeight: 800,
            pointerEvents: 'none', zIndex: 2,
          }}
        >↑ الممشى (كم)</span>
        <span
          style={{
            position: 'absolute', bottom: 4, insetInlineEnd: 4,
            color: NAVY_900, fontSize: 16, fontWeight: 800,
            pointerEvents: 'none', zIndex: 2,
          }}
        >السعر (ريال) →</span>

        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 24, right: 40, bottom: 36, left: 56 }}>
            <CartesianGrid stroke={SLATE_100} strokeDasharray="0" />

            {/* Two zones only:
                  deal  = low x + low y (emerald-50)
                  avoid = high x + high y (rose-50)
                Recharts handles the visual flip when XAxis is `reversed`.
                Other two quadrants stay transparent. */}
            {xMid > 0 && yMid > 0 && (
              <>
                <ReferenceArea x1={0} x2={xMid} y1={0} y2={yMid}
                  fill="#ECFDF5" fillOpacity={1} stroke="none" ifOverflow="extendDomain" />
                <ReferenceArea x1={xMid} x2={xMax} y1={yMid} y2={yMax}
                  fill="#FFF1F2" fillOpacity={1} stroke="none" ifOverflow="extendDomain" />
              </>
            )}

            <XAxis
              type="number" dataKey="x"
              domain={[0, xMax]}
              ticks={xTicks}
              tickFormatter={fmt}
              tick={{ fill: SLATE_700, fontSize: 13, fontWeight: 700 }}
              stroke={SLATE_200}
              tickLine={false}
              reversed={reversedX}
              allowDataOverflow={false}
            />
            <YAxis
              type="number" dataKey="y"
              domain={[0, yMax]}
              ticks={yTicks}
              tickFormatter={fmt}
              tick={{ fill: SLATE_700, fontSize: 13, fontWeight: 700 }}
              stroke={SLATE_200}
              tickLine={false}
              width={64}
              allowDataOverflow={false}
              orientation={reversedX ? 'right' : 'left'}
            />
            <Tooltip cursor={false} content={<ChartTooltip />} wrapperStyle={{ outline: 'none' }} />
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

        {/* Corner labels for the two highlighted zones.
            Deal label: bottom + leading edge (auto-flips with dir).
            Avoid label: top + trailing edge. */}
        {xMid > 0 && yMid > 0 && (
          <>
            <span
              style={{
                position: 'absolute',
                bottom: 56,
                insetInlineStart: 72,
                color: '#047857',
                fontSize: 14,
                fontWeight: 800,
                background: 'rgba(255,255,255,0.85)',
                padding: '3px 10px',
                borderRadius: 999,
                pointerEvents: 'none',
              }}
            >
              منطقة اللقطات
            </span>
            <span
              style={{
                position: 'absolute',
                top: 40,
                insetInlineEnd: 72,
                color: '#BE123C',
                fontSize: 14,
                fontWeight: 800,
                background: 'rgba(255,255,255,0.85)',
                padding: '3px 10px',
                borderRadius: 999,
                pointerEvents: 'none',
              }}
            >
              أعلى من السوق
            </span>
          </>
        )}
      </div>
    </div>
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
