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
import { MODEL_COLORS } from './bundles'

const CORAL  = '#FF6B4A'
const NAVY_900 = '#0F172A'
const NAVY   = '#1E293B'
const SLATE_700 = '#334155'
const SLATE  = '#64748B'
const SLATE_400 = '#94A3B8'
const SLATE_100 = '#F1F5F9'
const SLATE_50  = '#F8FAFC'
const SLATE_200 = '#E2E8F0'

type ModelKey = { make: string; model: string }
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

const MAX_SLOTS = 5
const YEAR_OPTIONS = Array.from({ length: 2026 - 2005 + 1 }, (_, i) => 2026 - i)
const POINT_CAP = 120

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

// Generate explicit ticks every `step` from a domain. Recharts default
// tick algorithm picks weird numbers; we want 50k, 100k, 150k, … etc.
function ticksForDomain (lo: number, hi: number, step: number): number[] {
  if (hi <= lo) return [lo]
  const start = Math.ceil(lo / step) * step
  const out: number[] = []
  for (let v = start; v <= hi; v += step) out.push(v)
  return out
}

export default function HuntClient ({
  initialModels,
  initialYearMin,
  initialYearMax,
  initialListings,
  canonicalMakes,
  canonicalModels,
}: {
  initialModels: ModelKey[]
  initialYearMin: number
  initialYearMax: number
  initialListings: Listing[]
  canonicalMakes: CanonicalMake[]
  canonicalModels: CanonicalModel[]
}) {
  const router = useRouter()

  // The 5 slots are a fixed-length array of (ModelKey | null) so positions
  // determine the color assignment (slot 1 = coral, slot 2 = emerald, …).
  const [slots, setSlots] = useState<(ModelKey | null)[]>(() => {
    const seeded: (ModelKey | null)[] = Array(MAX_SLOTS).fill(null)
    initialModels.slice(0, MAX_SLOTS).forEach((m, i) => { seeded[i] = m })
    return seeded
  })
  const [yearMin, setYearMin] = useState(initialYearMin)
  const [yearMax, setYearMax] = useState(initialYearMax)
  const [listings, setListings] = useState<Listing[]>(initialListings)
  const [pinned, setPinned] = useState<string[]>([])
  const [hoverId, setHoverId] = useState<string | null>(null)

  // Reflect the current selection in the URL on changes (skip initial mount).
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    const filled = slots.filter(Boolean) as ModelKey[]
    if (filled.length === 0) {
      router.replace('/hunt', { scroll: false })
      setListings([])
      return
    }
    const modelsQ = filled.map(m => `${m.make}-${m.model}`).join(',')
    const yearsQ  = `${yearMin}-${yearMax}`
    router.replace(`/hunt?models=${encodeURIComponent(modelsQ)}&years=${encodeURIComponent(yearsQ)}`, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, yearMin, yearMax])

  useEffect(() => { setListings(initialListings) }, [initialListings])

  // Per-slot grouping: index → matching listings + color + display label.
  type SlotGroup = {
    color: string
    labelAr: string
    listings: Listing[]
    slotIndex: number
  }
  const slotGroups: SlotGroup[] = useMemo(() => {
    return slots.map((m, idx): SlotGroup | null => {
      if (!m) return null
      const matching = listings.filter(l => l.make_slug === m.make && l.model_slug === m.model)
      const cm = canonicalModels.find(c => c.canonical_make_slug === m.make && c.canonical_model_slug === m.model)
      const ck = canonicalMakes.find(c => c.canonical_make_slug === m.make)
      const labelAr = cm && ck
        ? `${ck.canonical_name_ar} ${cm.canonical_name_ar}`
        : (matching[0]?.make_ar && matching[0]?.model_ar
            ? `${matching[0].make_ar} ${matching[0].model_ar}`
            : `${m.make} ${m.model}`)
      return { color: MODEL_COLORS[idx] ?? CORAL, labelAr, listings: matching, slotIndex: idx }
    }).filter(Boolean) as SlotGroup[]
  }, [slots, listings, canonicalMakes, canonicalModels])

  const hasAnyModel = slotGroups.length > 0

  // Chart data with axis clipping + median computation for zone shading.
  const chart = useMemo(() => {
    const all = slotGroups.flatMap(g => g.listings)
    if (all.length === 0) {
      return {
        pointsByGroup: [] as ChartGroup[],
        xMin: 0, xMax: 0, yMin: 0, yMax: 0,
        xMid: 0, yMid: 0,
        clippedCount: 0, totalCount: 0,
      }
    }
    const prices = [...all.map(l => l.price_sar!).filter(Number.isFinite)].sort((a, b) => a - b)
    const miles  = [...all.map(l => l.mileage_km!).filter(Number.isFinite)].sort((a, b) => a - b)
    const xMin = percentile(prices, 5)
    const xMax = percentile(prices, 95)
    const yMin = 0
    const yMax = percentile(miles, 95)
    const inRange = (l: Listing) =>
      l.price_sar! >= xMin && l.price_sar! <= xMax && l.mileage_km! <= yMax
    const pointsByGroup: ChartGroup[] = slotGroups.map(g => {
      const data = g.listings
        .filter(inRange)
        .map(l => ({ x: l.price_sar!, y: l.mileage_km!, id: l.id, listing: l }))
      return { color: g.color, label: g.labelAr, data }
    })
    const totalInRange = pointsByGroup.reduce((a, m) => a + m.data.length, 0)
    if (totalInRange > POINT_CAP) {
      const ranked = pointsByGroup.flatMap(m =>
        m.data.map(d => ({ id: d.id, score: d.listing.deal_score ?? -1 }))
      ).sort((a, b) => b.score - a.score).slice(0, POINT_CAP)
      const keep = new Set(ranked.map(r => r.id))
      for (const m of pointsByGroup) m.data = m.data.filter(d => keep.has(d.id))
    }
    // Medians taken from the in-range, in-cap set so zones reflect what's
    // actually plotted.
    const renderedPrices = pointsByGroup.flatMap(m => m.data.map(d => d.x)).sort((a, b) => a - b)
    const renderedMiles  = pointsByGroup.flatMap(m => m.data.map(d => d.y)).sort((a, b) => a - b)
    return {
      pointsByGroup,
      xMin, xMax, yMin, yMax,
      xMid: median(renderedPrices), yMid: median(renderedMiles),
      clippedCount: all.length - totalInRange,
      totalCount: all.length,
    }
  }, [slotGroups])

  const totalRendered = chart.pointsByGroup.reduce((a, m) => a + m.data.length, 0)

  function setSlot (idx: number, value: ModelKey | null) {
    setSlots(prev => {
      const next = [...prev]
      next[idx] = value
      return next
    })
    setPinned([])
  }
  function togglePin (id: string) {
    setPinned(prev => prev.includes(id)
      ? prev.filter(p => p !== id)
      : (prev.length >= 4 ? prev : [...prev, id]))
  }

  // Listings strip data: pinned → show only pins; else show all in-chart.
  const stripIds = useMemo(() => {
    if (pinned.length > 0) return pinned
    return chart.pointsByGroup.flatMap(g => g.data.map(d => d.id))
  }, [pinned, chart])
  const stripListings: Listing[] = useMemo(() => {
    const idSet = new Set(stripIds)
    return listings
      .filter(l => idSet.has(l.id))
      .sort((a, b) => (b.deal_score ?? -1) - (a.deal_score ?? -1))
  }, [stripIds, listings])

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

      {/* ── 5 model slots + year range ── */}
      <section className="max-w-screen-xl mx-auto px-4 pb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          {slots.map((slot, idx) => (
            <ModelSlot
              key={idx}
              slotIndex={idx}
              value={slot}
              color={MODEL_COLORS[idx]}
              onChange={v => setSlot(idx, v)}
              canonicalMakes={canonicalMakes}
              canonicalModels={canonicalModels}
              alreadyPicked={slots
                .filter((s, i) => i !== idx && s != null)
                .map(s => `${s!.make}|${s!.model}`)}
            />
          ))}
        </div>

        <div className="flex items-center gap-3 mt-4">
          <YearSelect label="من" value={yearMin} max={yearMax} onChange={setYearMin} />
          <YearSelect label="إلى" value={yearMax} min={yearMin} onChange={setYearMax} />
        </div>
      </section>

      {/* ── Chart ── */}
      <section className="max-w-screen-xl mx-auto px-4 pb-4">
        <div
          className="rounded-2xl relative"
          style={{
            background: '#FFFFFF',
            border: `1px solid ${SLATE_200}`,
            padding: 24,
            boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
          }}
        >
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mb-4 text-[13px]" style={{ color: NAVY }}>
            {slotGroups.map(g => (
              <span key={g.slotIndex} className="inline-flex items-center gap-2 font-semibold">
                <span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, background: g.color }} />
                {g.labelAr} <span style={{ color: SLATE, fontWeight: 500 }}>· {g.listings.length}</span>
              </span>
            ))}
          </div>

          {!hasAnyModel ? (
            <EmptyState />
          ) : totalRendered < 1 ? (
            <div
              className="flex items-center justify-center text-center"
              style={{ height: 400, color: SLATE, fontSize: 14 }}
            >
              ما لقينا سيارات في هذا المدى. وسّع السنوات أو غيّر الموديلات.
            </div>
          ) : (
            <HuntChart
              groups={chart.pointsByGroup}
              xMin={chart.xMin} xMax={chart.xMax}
              yMin={chart.yMin} yMax={chart.yMax}
              xMid={chart.xMid} yMid={chart.yMid}
              hoverId={hoverId}
              pinned={pinned}
              onHover={setHoverId}
              onClick={togglePin}
            />
          )}
        </div>
      </section>

      {/* ── Listings strip count bridge + cards ── */}
      {hasAnyModel && totalRendered > 0 && (
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
            السيارات في المخطط ({stripListings.length} {stripListings.length === 1 ? 'سيارة' : 'سيارة'})
            {pinned.length > 0
              ? <> · <button onClick={() => setPinned([])} className="underline" style={{ color: CORAL }}>عرض كل السيارات</button></>
              : <> — مرتبة حسب أحسن صفقة</>}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stripListings.map((l, i) => {
              const g = slotGroups.find(g => g.color === MODEL_COLORS[slots.findIndex(s => s?.make === l.make_slug && s?.model === l.model_slug)])
              const color = g?.color ?? CORAL
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

// ── Empty state when no slots are filled ─────────────────────────────────────
function EmptyState () {
  return (
    <div
      className="flex flex-col items-center justify-center text-center px-4"
      style={{ height: 400 }}
    >
      <Target
        size={80}
        strokeWidth={1.2}
        color={CORAL}
        style={{ opacity: 0.18, marginBottom: 16 }}
      />
      <p style={{ color: SLATE_700, fontSize: 17, fontWeight: 600 }}>
        اختر موديل واحد على الأقل في الخانات أعلاه لتشوف المخطط
      </p>
      <p className="mt-1" style={{ color: SLATE, fontSize: 13 }}>
        يمكنك اختيار حتى ٥ موديلات للمقارنة
      </p>
    </div>
  )
}

// ── Year picker ──────────────────────────────────────────────────────────────
function YearSelect ({ label, value, min, max, onChange }: {
  label: string
  value: number
  min?: number
  max?: number
  onChange: (v: number) => void
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: NAVY }}>
      <span style={{ color: SLATE }}>{label}:</span>
      <select
        value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        style={{
          background: '#FFFFFF',
          border: `1px solid ${SLATE_200}`,
          borderRadius: 12,
          padding: '8px 14px',
          fontSize: 14,
          fontWeight: 700,
          color: NAVY,
        }}
      >
        {YEAR_OPTIONS.filter(y => (min == null || y >= min) && (max == null || y <= max)).map(y => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </label>
  )
}

// ── Model slot picker (make → model two-step popover) ────────────────────────
function ModelSlot ({
  slotIndex, value, color, onChange,
  canonicalMakes, canonicalModels, alreadyPicked,
}: {
  slotIndex: number
  value: ModelKey | null
  color: string
  onChange: (v: ModelKey | null) => void
  canonicalMakes: CanonicalMake[]
  canonicalModels: CanonicalModel[]
  alreadyPicked: string[]   // strings "make|model" so the picker can grey them out
}) {
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<'make' | 'model'>('make')
  const [pickedMake, setPickedMake] = useState<string | null>(value?.make ?? null)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick (e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  // Resolved labels for the closed-state button.
  const cm = value && canonicalModels.find(c => c.canonical_make_slug === value.make && c.canonical_model_slug === value.model)
  const ck = value && canonicalMakes.find(c => c.canonical_make_slug === value.make)
  const label = value && cm && ck ? `${ck.canonical_name_ar} ${cm.canonical_name_ar}` : null

  // Stage filtering.
  const q = query.trim().toLowerCase()
  const visibleMakes = canonicalMakes.filter(m =>
    !q || m.canonical_name_ar.toLowerCase().includes(q) || m.canonical_name_en.toLowerCase().includes(q)
  )
  const visibleModels = pickedMake
    ? canonicalModels
        .filter(c => c.canonical_make_slug === pickedMake)
        .filter(c => !q || c.canonical_name_ar.toLowerCase().includes(q) || c.canonical_name_en.toLowerCase().includes(q))
    : []

  function openPicker () {
    setOpen(true)
    setStage(value ? 'model' : 'make')
    setPickedMake(value?.make ?? null)
    setQuery('')
  }
  function pickMake (slug: string) {
    setPickedMake(slug); setStage('model'); setQuery('')
  }
  function pickModel (slug: string) {
    if (!pickedMake) return
    onChange({ make: pickedMake, model: slug })
    setOpen(false)
  }
  function clear (e: React.MouseEvent) {
    e.stopPropagation()
    onChange(null)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={openPicker}
        className="w-full text-right inline-flex items-center justify-between gap-2 px-3"
        style={{
          height: 56,
          background: '#FFFFFF',
          border: `1px solid ${SLATE_200}`,
          borderInlineStart: `4px solid ${value ? color : SLATE_200}`,
          borderRadius: 12,
          color: value ? NAVY : SLATE_400,
          fontSize: 14,
          fontWeight: value ? 700 : 500,
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate text-start">
          {label ?? `اختر موديل ${slotIndex + 1}`}
        </span>
        {value
          ? <span
              onClick={clear}
              className="inline-flex items-center justify-center rounded-full w-6 h-6 hover:bg-slate-100 cursor-pointer"
              style={{ color: SLATE, fontSize: 16 }}
              aria-label="مسح"
            >×</span>
          : <span aria-hidden style={{ color: SLATE_400 }}>▾</span>}
      </button>

      {open && (
        <div
          className="absolute z-30 right-0 left-0 mt-1.5 rounded-xl"
          style={{
            background: '#FFFFFF',
            border: `1px solid ${SLATE_200}`,
            boxShadow: '0 12px 32px rgba(15,23,42,0.12)',
            maxHeight: 360,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
          role="dialog"
        >
          {/* Header with crumbs + search */}
          <div className="flex items-center gap-2 p-2" style={{ borderBottom: `1px solid ${SLATE_100}` }}>
            {stage === 'model' && pickedMake && (
              <button
                onClick={() => { setStage('make'); setQuery('') }}
                className="text-[12px] font-bold inline-flex items-center gap-1"
                style={{ color: CORAL }}
                aria-label="رجوع للماركات"
              >
                ← {canonicalMakes.find(m => m.canonical_make_slug === pickedMake)?.canonical_name_ar ?? pickedMake}
              </button>
            )}
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={stage === 'make' ? 'ابحث عن ماركة...' : 'ابحث عن موديل...'}
              autoFocus
              className="flex-1 min-w-0"
              dir="auto"
              style={{
                fontSize: 13,
                padding: '6px 8px',
                outline: 'none',
                background: SLATE_50,
                border: `1px solid ${SLATE_200}`,
                borderRadius: 8,
                color: NAVY,
              }}
            />
          </div>

          <div className="overflow-y-auto" style={{ flex: 1 }}>
            {stage === 'make' && visibleMakes.map(m => (
              <button
                key={m.canonical_make_slug}
                onClick={() => pickMake(m.canonical_make_slug)}
                className="block w-full text-right px-3 py-2 hover:bg-slate-50 transition-colors"
                style={{ color: NAVY, fontSize: 13, fontWeight: 600 }}
              >
                {m.canonical_name_ar}
                <span className="ms-2" style={{ color: SLATE, fontSize: 11, fontWeight: 500 }}>
                  {m.canonical_name_en}
                </span>
              </button>
            ))}
            {stage === 'make' && visibleMakes.length === 0 && (
              <div className="px-3 py-6 text-center" style={{ color: SLATE, fontSize: 13 }}>
                ما لقينا ماركة بهذا الاسم
              </div>
            )}

            {stage === 'model' && visibleModels.map(c => {
              const tok = `${c.canonical_make_slug}|${c.canonical_model_slug}`
              const dim = alreadyPicked.includes(tok)
              return (
                <button
                  key={c.canonical_model_slug}
                  onClick={() => !dim && pickModel(c.canonical_model_slug)}
                  disabled={dim}
                  className="block w-full text-right px-3 py-2 transition-colors"
                  style={{
                    color: dim ? SLATE_400 : NAVY,
                    fontSize: 13,
                    fontWeight: 600,
                    background: dim ? SLATE_50 : 'transparent',
                  }}
                >
                  {c.canonical_name_ar}
                  <span className="ms-2" style={{ color: SLATE, fontSize: 11, fontWeight: 500 }}>
                    {c.canonical_name_en}
                  </span>
                  {dim && <span className="ms-1" style={{ color: SLATE_400, fontSize: 10 }}>· مختار</span>}
                </button>
              )
            })}
            {stage === 'model' && visibleModels.length === 0 && (
              <div className="px-3 py-6 text-center" style={{ color: SLATE, fontSize: 13 }}>
                ما لقينا موديل
              </div>
            )}
          </div>
        </div>
      )}
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
  groups, xMin, xMax, yMin, yMax, xMid, yMid,
  hoverId, pinned, onHover, onClick,
}: {
  groups: ChartGroup[]
  xMin: number; xMax: number; yMin: number; yMax: number
  xMid: number; yMid: number
  hoverId: string | null
  pinned: string[]
  onHover: (id: string | null) => void
  onClick: (id: string) => void
}) {
  const anyHover = hoverId !== null
  const dotShape = useCallback((props: { cx?: number; cy?: number; payload?: { id: string }; fill?: string }) => {
    const { cx, cy, payload, fill } = props
    if (cx == null || cy == null || !payload) return <g />
    const id = payload.id
    const isHover  = hoverId === id
    const isPinned = pinned.includes(id)
    const r = isHover ? 16 : 10
    const fillOpacity = anyHover ? (isHover ? 1 : 0.25) : 1
    return (
      <g
        style={{ cursor: 'pointer', transition: 'r 0.2s' }}
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

  // Explicit ticks at 50k intervals on both axes for legibility.
  const xTicks = ticksForDomain(xMin, xMax, 50_000)
  const yTicks = ticksForDomain(yMin, yMax, 50_000)
  const fmt = (v: number) => v.toLocaleString('en-US')

  return (
    <div className="relative" style={{ width: '100%', height: 540 }}>
      {/* Y axis label (top-left) */}
      <div
        style={{
          position: 'absolute', top: 4, insetInlineStart: 4,
          color: NAVY_900, fontSize: 16, fontWeight: 800,
          pointerEvents: 'none', zIndex: 2,
        }}
      >
        ↑ الممشى (كم)
      </div>
      {/* X axis label (bottom-right in RTL = visual bottom-right) */}
      <div
        style={{
          position: 'absolute', bottom: 4, insetInlineEnd: 4,
          color: NAVY_900, fontSize: 16, fontWeight: 800,
          pointerEvents: 'none', zIndex: 2,
        }}
      >
        السعر (ريال) →
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart margin={{ top: 28, right: 40, bottom: 44, left: 56 }}>
          <CartesianGrid stroke={SLATE_100} strokeDasharray="0" />

          {/* Zone shading — bottom-left = deal zone (emerald-50), etc. */}
          {xMid > 0 && yMid > 0 && (
            <>
              <ReferenceArea x1={xMin} x2={xMid} y1={yMin} y2={yMid} fill="#ECFDF5" fillOpacity={1} stroke="none" ifOverflow="extendDomain" />
              <ReferenceArea x1={xMid} x2={xMax} y1={yMin} y2={yMid} fill="#F8FAFC" fillOpacity={1} stroke="none" ifOverflow="extendDomain" />
              <ReferenceArea x1={xMin} x2={xMid} y1={yMid} y2={yMax} fill="#FFFBEB" fillOpacity={1} stroke="none" ifOverflow="extendDomain" />
              <ReferenceArea x1={xMid} x2={xMax} y1={yMid} y2={yMax} fill="#FFF1F2" fillOpacity={1} stroke="none" ifOverflow="extendDomain" />
            </>
          )}

          <XAxis
            type="number" dataKey="x"
            domain={[xMin, xMax]}
            ticks={xTicks}
            tickFormatter={fmt}
            tick={{ fill: SLATE_700, fontSize: 14, fontWeight: 700 }}
            stroke="rgba(255,107,74,0.25)"
            tickLine={false}
          />
          <YAxis
            type="number" dataKey="y"
            domain={[yMin, yMax]}
            ticks={yTicks}
            tickFormatter={fmt}
            tick={{ fill: SLATE_700, fontSize: 14, fontWeight: 700 }}
            stroke="rgba(16,185,129,0.25)"
            tickLine={false}
            width={64}
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

      {/* Zone labels (only shown when chart has enough data) */}
      {xMid > 0 && yMid > 0 && (
        <ZoneLabels />
      )}
    </div>
  )
}

// Static corner labels — positioned by parent's flex stacking rather than
// trying to match exact Recharts coordinates. Good enough for first
// orientation; users learn the zones quickly.
function ZoneLabels () {
  const labelStyle: React.CSSProperties = {
    position: 'absolute',
    fontSize: 13, fontWeight: 800,
    pointerEvents: 'none',
    background: 'rgba(255,255,255,0.85)',
    padding: '3px 8px',
    borderRadius: 999,
  }
  return (
    <>
      {/* bottom-LEFT in RTL = visual bottom-right of chart inner = high-price (since X is mirrored visually under RTL? — Recharts ignores dir).
          Recharts uses LTR for its math regardless of dir attribute, so:
          bottom-left of plot = low x (low price) + low y (low km) → deal zone */}
      <span style={{ ...labelStyle, bottom: 56, insetInlineStart: 72, color: '#047857' }}>
        منطقة اللقطات
      </span>
      <span style={{ ...labelStyle, bottom: 56, insetInlineEnd: 56, color: SLATE_700 }}>
        سعر أعلى، ممشى أقل
      </span>
      <span style={{ ...labelStyle, top: 40, insetInlineStart: 72, color: '#B45309' }}>
        سعر أقل، ممشى أعلى
      </span>
      <span style={{ ...labelStyle, top: 40, insetInlineEnd: 56, color: '#BE123C' }}>
        أعلى من السوق
      </span>
    </>
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
