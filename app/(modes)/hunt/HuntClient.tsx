'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Target, AlertCircle, Scale, MousePointer2, Pin, Sparkles,
} from 'lucide-react'
import {
  ComposedChart, Scatter, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, ReferenceArea,
} from 'recharts'
import type { Listing } from '@/lib/supabase'
import ListingCard from '@/app/components/ListingCard'
import { useLang } from '@/app/components/LangContext'
import { MODEL_COLORS } from './bundles'

// ── Palette ─────────────────────────────────────────────────────────────────
const CORAL    = '#FF6B4A'
const NAVY_900 = '#0F172A'
const NAVY     = '#1E293B'
const SLATE_700 = '#334155'
const SLATE     = '#64748B'
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

// ── Types ──────────────────────────────────────────────────────────────────
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

// One row per renderable listing on the chart. All interaction state
// references entries here by their stable `id` — never by array index.
type ChartPoint = {
  id: string
  modelKey: string       // "make|model" — for color grouping
  modelColor: string
  modelLabel: string     // resolved label for the legend / tooltip
  x: number              // price_sar
  y: number              // mileage_km
  listing: Listing
}

// ── Math helpers ───────────────────────────────────────────────────────────
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

// Defensive validity check on a raw listing.
function isPlottable (l: Listing): boolean {
  if (!l || !l.id) return false
  if (!l.make_slug || !l.model_slug) return false
  if (typeof l.price_sar !== 'number'  || !Number.isFinite(l.price_sar)  || l.price_sar  <= 0) return false
  if (typeof l.mileage_km !== 'number' || !Number.isFinite(l.mileage_km) || l.mileage_km <= 0) return false
  return true
}

// ── Component ──────────────────────────────────────────────────────────────
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

  const [slots, setSlots] = useState<Slot[]>(() => {
    const seeded: Slot[] = Array(MAX_SLOTS).fill(null)
    initialSpecs.slice(0, MAX_SLOTS).forEach((s, i) => { seeded[i] = s })
    return seeded
  })
  const [perSlot, setPerSlot] = useState<Listing[][]>(initialPerSlot)
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set())
  const [hoverId,   setHoverId]   = useState<string | null>(null)
  const [hoverXY,   setHoverXY]   = useState<{ x: number; y: number } | null>(null)

  const [tooManyDismissed, setTooManyDismissed] = useState(false)
  useEffect(() => {
    try { setTooManyDismissed(window.sessionStorage.getItem('hunt_4plus_dismissed') === '1') } catch {}
  }, [])
  function dismissTooMany () {
    setTooManyDismissed(true)
    try { window.sessionStorage.setItem('hunt_4plus_dismissed', '1') } catch {}
  }

  // Sync slot state into the URL on changes (skip first mount).
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
    router.replace(
      `/hunt?models=${encodeURIComponent(modelsQ)}&years=${encodeURIComponent(yearsQ)}`,
      { scroll: false },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots])

  useEffect(() => { setPerSlot(initialPerSlot) }, [initialPerSlot])

  // ── Slot mutators ─────────────────────────────────────────────────────────
  function setSlot (idx: number, value: Slot) {
    setSlots(prev => {
      const next = [...prev]; next[idx] = value; return next
    })
    // Reset interactions — pinned/hover IDs may belong to listings about
    // to disappear. The pinned-prune effect below will refill what's still
    // valid once the next data fetch lands.
    setPinnedIds(new Set())
    setHoverId(null)
    setHoverXY(null)
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
    setPinnedIds(new Set()); setHoverId(null); setHoverXY(null)
  }
  function setSlotYears (idx: number, yearMin: number, yearMax: number) {
    setSlots(prev => {
      const cur = prev[idx]
      if (!cur) return prev
      const next = [...prev]
      next[idx] = { ...cur, yearMin, yearMax }
      return next
    })
    setPinnedIds(new Set()); setHoverId(null); setHoverXY(null)
  }

  // ── Group resolved metadata for each filled slot (in slot order) ─────────
  type SlotGroup = {
    color: string
    labelAr: string
    labelEn: string
    listings: Listing[]
    slotIndex: number
  }
  const slotGroups: SlotGroup[] = useMemo(() => {
    const groups: SlotGroup[] = []
    let perSlotCursor = 0
    slots.forEach((s, idx) => {
      if (!s || !s.model) return
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

  // ── Canonical ChartPoint set — single source of truth, keyed by id ────────
  // Built once per (slotGroups, lang) change. Everything downstream that
  // needs to look up a listing does so via this map by id, not by index
  // into a Recharts payload (which is the root cause of the desync bugs).
  const chart = useMemo(() => {
    if (slotGroups.length === 0) {
      return {
        all: [] as ChartPoint[],
        byId: new Map<string, ChartPoint>(),
        rendered: [] as ChartPoint[],
        excluded: { invalid: 0, offChart: 0 },
        xMin: 0, xMax: 1, yMin: 0, yMax: 1,
        xStep: 50_000, yStep: 50_000,
        xMid: 0, yMid: 0,
      }
    }
    // 1. Build the master point list with defensive validity filtering.
    const all: ChartPoint[] = []
    let invalidCount = 0
    for (const g of slotGroups) {
      for (const l of g.listings) {
        if (!isPlottable(l)) { invalidCount++; continue }
        all.push({
          id: l.id,
          modelKey: `${l.make_slug}|${l.model_slug}`,
          modelColor: g.color,
          modelLabel: lang === 'ar' ? g.labelAr : g.labelEn,
          x: l.price_sar!,
          y: l.mileage_km!,
          listing: l,
        })
      }
    }
    if (all.length === 0) {
      return {
        all,
        byId: new Map<string, ChartPoint>(all.map(p => [p.id, p])),
        rendered: [] as ChartPoint[],
        excluded: { invalid: invalidCount, offChart: 0 },
        xMin: 0, xMax: 1, yMin: 0, yMax: 1,
        xStep: 50_000, yStep: 50_000,
        xMid: 0, yMid: 0,
      }
    }

    // 2. Pick a tick step and snap min/max to clean multiples of it.
    const prices = all.map(p => p.x).sort((a, b) => a - b)
    const miles  = all.map(p => p.y).sort((a, b) => a - b)
    function dynamicAxis (vals: number[]) {
      const rawMin = vals[0]
      const p95    = percentile(vals, 95)
      const spread = Math.max(1, p95 - rawMin)
      const step = spread <= 25_000  ? 10_000
                 : spread <= 200_000 ? 25_000
                 :                     50_000
      const min = Math.max(0, Math.floor((rawMin * 0.9) / step) * step)
      const max = Math.ceil ((p95    * 1.1) / step) * step
      return { min, max: Math.max(max, min + step), step }
    }
    const x = dynamicAxis(prices)
    const y = dynamicAxis(miles)

    // 3. Clip points outside the axis range — count as off-chart.
    const inRange = (p: ChartPoint) =>
      p.x >= x.min && p.x <= x.max &&
      p.y >= y.min && p.y <= y.max
    let rendered = all.filter(inRange)
    const offChart = all.length - rendered.length

    // 4. Cap to POINT_CAP top-by-deal-score.
    if (rendered.length > POINT_CAP) {
      rendered = [...rendered]
        .sort((a, b) => (b.listing.deal_score ?? -1) - (a.listing.deal_score ?? -1))
        .slice(0, POINT_CAP)
    }

    // 5. Jitter overlapping points by a small fraction of the range so
    // hover hits aren't blocked by exact stacking. Stable per id.
    const xJitterScale = (x.max - x.min) * 0.002
    const yJitterScale = (y.max - y.min) * 0.002
    function pseudoRand (id: string) {
      let h = 0
      for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
      return ((h & 0x7fff) / 0x7fff - 0.5) * 2  // [-1, 1]
    }
    rendered = rendered.map(p => ({
      ...p,
      x: p.x + xJitterScale * pseudoRand(p.id + 'x'),
      y: p.y + yJitterScale * pseudoRand(p.id + 'y'),
    }))

    const byId = new Map<string, ChartPoint>(all.map(p => [p.id, p]))
    const renderedPrices = rendered.map(p => p.x).sort((a, b) => a - b)
    const renderedMiles  = rendered.map(p => p.y).sort((a, b) => a - b)
    return {
      all, byId, rendered,
      excluded: { invalid: invalidCount, offChart },
      xMin: x.min, xMax: x.max, yMin: y.min, yMax: y.max,
      xStep: x.step, yStep: y.step,
      xMid: median(renderedPrices), yMid: median(renderedMiles),
    }
  }, [slotGroups, lang])

  // ── Pinned cleanup: drop any pinned id that's no longer in the rendered set.
  // Runs whenever the data changes so stale references are pruned. We use a
  // ref to compare the previous rendered-id signature and only mutate state
  // when the set actually shrinks.
  const lastRenderedIdsRef = useRef<string>('')
  useEffect(() => {
    const renderedIds = new Set(chart.rendered.map(p => p.id))
    const sig = chart.rendered.map(p => p.id).sort().join(',')
    if (sig === lastRenderedIdsRef.current) return
    lastRenderedIdsRef.current = sig
    setPinnedIds(prev => {
      const next = new Set<string>()
      let changed = false
      for (const id of prev) {
        if (renderedIds.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
    setHoverId(prev => (prev && !renderedIds.has(prev) ? null : prev))
  }, [chart.rendered])

  function togglePin (id: string) {
    setPinnedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < 4) next.add(id)
      return next
    })
  }

  // ── Strip data ───────────────────────────────────────────────────────────
  // Strict invariant: the strip iterates over the EXACT same set of
  // listings that's plotted in the chart. The default 12-cap was the
  // source of the "chart shows 24, strip shows 12" mismatch — gone.
  //   - No pins      → every chart.rendered listing, sorted by deal_score
  //   - 1–4 pins     → only those listings, in click order
  const stripListings: Listing[] = useMemo(() => {
    if (pinnedIds.size > 0) {
      const ids = [...pinnedIds]
      return ids
        .map(id => chart.byId.get(id)?.listing)
        .filter(Boolean) as Listing[]
    }
    return chart.rendered
      .map(p => p.listing)
      .sort((a, b) => (b.deal_score ?? -1) - (a.deal_score ?? -1))
  }, [pinnedIds, chart])

  // Look up the listing's slot color when rendering the comparison strip
  // (must match the dot's color so the user can tell which slot a card
  // came from).
  const colorOf = useCallback((id: string) => chart.byId.get(id)?.modelColor ?? CORAL, [chart])

  // Hover/tooltip data — derived strictly from hoverId via byId, never
  // from Recharts payloads (that was the source of the cross-wired tooltip
  // bug).
  const hoverPoint = hoverId ? chart.byId.get(hoverId) ?? null : null

  return (
    <div dir="rtl" className="min-h-screen" style={{ background: 'var(--bg-page)' }}>
      {/* ── Intro + tips ── */}
      <section className="max-w-screen-xl mx-auto px-4" style={{ paddingTop: 40, paddingBottom: 24 }}>
        <div className="grid grid-cols-1 md:grid-cols-[55fr_45fr] gap-6">
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

      {/* ── 4+ models soft warning ── */}
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
          {/* (Model legend moved out of the chart frame — see the
              "Y-title row above the frame" in HuntChart for its new
              top-right home.) */}

          {!hasAnyFullSlot ? (
            <EmptyState />
          ) : chart.rendered.length < 1 ? (
            <div
              className="flex items-center justify-center text-center"
              style={{ height: 360, color: SLATE, fontSize: 14 }}
            >
              ما لقينا سيارات في هذا المدى. وسّع السنوات أو غيّر الموديلات.
            </div>
          ) : (
            <HuntChart
              points={chart.rendered}
              xMin={chart.xMin} xMax={chart.xMax}
              yMin={chart.yMin} yMax={chart.yMax}
              xStep={chart.xStep} yStep={chart.yStep}
              xMid={chart.xMid} yMid={chart.yMid}
              hoverId={hoverId}
              pinnedIds={pinnedIds}
              onHover={(id, xy) => { setHoverId(id); setHoverXY(xy) }}
              onClick={togglePin}
              offChartCount={chart.excluded.offChart + chart.excluded.invalid}
              lang={lang}
              hoverPoint={hoverPoint}
              hoverXY={hoverXY}
            />
          )}
        </div>
      </section>

      {/* ── Listings strip ── */}
      {hasAnyFullSlot && chart.rendered.length > 0 && (
        <section className="max-w-screen-xl mx-auto px-4 pb-12">
          {/* Bridge — copy + clear control depend on whether the user has
              pinned anything. Selection mode shows "X من Y" so the user
              can see how many of the chart's points they've isolated. */}
          <div
            className="rounded-2xl flex items-center justify-between flex-wrap gap-2"
            style={{
              background: SLATE_50,
              padding: 12,
              marginBottom: 16,
              color: SLATE_700,
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            <span>
              <span aria-hidden style={{ marginInlineEnd: 8 }}>👇</span>
              {pinnedIds.size > 0
                ? <>السيارات المثبتة ({pinnedIds.size} من {chart.rendered.length})</>
                : <>السيارات في المخطط ({stripListings.length} سيارة) — مرتبة حسب أحسن صفقة</>}
            </span>
            {pinnedIds.size > 0 && (
              <button
                onClick={() => setPinnedIds(new Set())}
                className="inline-flex items-center gap-1"
                style={{
                  color: CORAL,
                  fontSize: 14,
                  fontWeight: 700,
                  textDecoration: 'underline',
                }}
              >
                عرض الكل ↩
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stripListings.map((l, i) => {
              const color = colorOf(l.id)
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

// ─── Banner ─────────────────────────────────────────────────────────────────
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

// ─── Tips panel ─────────────────────────────────────────────────────────────
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
      style={{ background: SLATE_50, border: `1px solid ${SLATE_200}`, padding: 20 }}
    >
      <h3 className="mb-3" style={{ color: SLATE_700, fontSize: 14, fontWeight: 800 }}>
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

// ─── Empty state ────────────────────────────────────────────────────────────
function EmptyState () {
  return (
    <div className="flex flex-col items-center justify-center text-center px-4" style={{ height: 360 }}>
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

// ─── Slot card ──────────────────────────────────────────────────────────────
function SlotCard ({
  slotIndex, slot, color,
  canonicalMakes, canonicalModels,
  onPickMake, onPickModel, onPickYears, onClear,
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
        borderTop:    `1px ${filled ? 'solid' : 'dashed'} ${SLATE_200}`,
        borderInlineEnd:  `1px ${filled ? 'solid' : 'dashed'} ${SLATE_200}`,
        borderBottom: `1px ${filled ? 'solid' : 'dashed'} ${SLATE_200}`,
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
      <div className="flex items-center justify-between">
        <span style={{ color: SLATE, fontSize: 13, fontWeight: 700 }}>
          موديل {slotIndex + 1}
          {slotIndex >= 3 && <span style={{ color: SLATE_400, fontWeight: 500 }}> (إضافي)</span>}
        </span>
        {fullyFilled && (
          <button
            type="button"
            onClick={onClear}
            aria-label="مسح"
            className="inline-flex items-center justify-center rounded-full w-5 h-5 hover:bg-slate-100"
            style={{ color: SLATE, fontSize: 14 }}
          >×</button>
        )}
      </div>

      <select
        value={slot?.make ?? ''}
        onChange={e => onPickMake(e.target.value || null)}
        style={{
          background: '#FFFFFF', border: `1px solid ${SLATE_200}`, borderRadius: 8,
          padding: '6px 10px', fontSize: 13, fontWeight: 600,
          color: slot?.make ? NAVY : SLATE_400, width: '100%',
        }}
      >
        <option value="">الماركة</option>
        {canonicalMakes.map(m => (
          <option key={m.canonical_make_slug} value={m.canonical_make_slug}>
            {m.canonical_name_ar}
          </option>
        ))}
      </select>

      <select
        value={slot?.model ?? ''}
        onChange={e => onPickModel(e.target.value || null)}
        disabled={!slot?.make}
        style={{
          background: !slot?.make ? SLATE_50 : '#FFFFFF',
          border: `1px solid ${SLATE_200}`, borderRadius: 8,
          padding: '6px 10px', fontSize: 13, fontWeight: 600,
          color: slot?.model ? NAVY : SLATE_400, width: '100%',
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

      <div className="flex items-center gap-1.5">
        <select
          value={yearMin}
          onChange={e => onPickYears(parseInt(e.target.value), Math.max(yearMax, parseInt(e.target.value)))}
          disabled={!fullyFilled}
          aria-label="من"
          style={{
            background: !fullyFilled ? SLATE_50 : '#FFFFFF',
            border: `1px solid ${SLATE_200}`, borderRadius: 8,
            padding: '4px 6px', fontSize: 12, fontWeight: 700, color: NAVY, flex: 1,
          }}
        >
          {YEAR_OPTIONS.map(y => <option key={y} value={y}>من {y}</option>)}
        </select>
        <select
          value={yearMax}
          onChange={e => onPickYears(Math.min(yearMin, parseInt(e.target.value)), parseInt(e.target.value))}
          disabled={!fullyFilled}
          aria-label="إلى"
          style={{
            background: !fullyFilled ? SLATE_50 : '#FFFFFF',
            border: `1px solid ${SLATE_200}`, borderRadius: 8,
            padding: '4px 6px', fontSize: 12, fontWeight: 700, color: NAVY, flex: 1,
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

// ─── Chart ──────────────────────────────────────────────────────────────────
function HuntChart ({
  points,
  xMin, xMax, yMin, yMax, xStep, yStep, xMid, yMid,
  hoverId, pinnedIds, onHover, onClick,
  offChartCount, lang,
  hoverPoint, hoverXY,
}: {
  points: ChartPoint[]
  xMin: number; xMax: number; yMin: number; yMax: number
  xStep: number; yStep: number
  xMid: number; yMid: number
  hoverId: string | null
  pinnedIds: Set<string>
  onHover: (id: string | null, xy: { x: number; y: number } | null) => void
  onClick: (id: string) => void
  offChartCount: number
  lang: 'ar' | 'en'
  hoverPoint: ChartPoint | null
  hoverXY: { x: number; y: number } | null
}) {
  const anyHover = hoverId !== null
  const containerRef = useRef<HTMLDivElement>(null)

  // One Scatter for all points; the dot shape reads its own color and
  // hover/pin state from the `id` stamped on each datum. This avoids the
  // multiple-Scatter z-stacking bug that made dots in earlier groups
  // unhoverable in the previous implementation.
  const dotShape = useCallback((props: { cx?: number; cy?: number; payload?: ChartPoint }) => {
    const { cx, cy, payload } = props
    if (cx == null || cy == null || !payload) return <g />
    const id = payload.id
    const isHover  = hoverId === id
    const isPinned = pinnedIds.has(id)
    const r = isHover ? 14 : 9
    const fillOpacity = anyHover ? (isHover ? 1 : 0.25) : 1
    return (
      <g
        style={{ cursor: 'pointer', transition: 'r 0.18s' }}
        onMouseEnter={e => {
          const rect = containerRef.current?.getBoundingClientRect()
          onHover(id, rect
            ? { x: e.clientX - rect.left, y: e.clientY - rect.top }
            : null)
        }}
        onMouseMove={e => {
          const rect = containerRef.current?.getBoundingClientRect()
          if (rect) onHover(id, { x: e.clientX - rect.left, y: e.clientY - rect.top })
        }}
        onMouseLeave={() => onHover(null, null)}
        onClick={() => onClick(id)}
      >
        <circle
          cx={cx} cy={cy} r={r}
          fill={payload.modelColor}
          fillOpacity={fillOpacity}
          stroke={isPinned ? CORAL : '#FFFFFF'}
          strokeWidth={isPinned ? 3 : 1}
        />
      </g>
    )
  }, [hoverId, pinnedIds, anyHover, onHover, onClick])

  const xTicks = ticksForDomain(xMin, xMax, xStep)
  const yTicks = ticksForDomain(yMin, yMax, yStep)
  const fmt = (v: number) => v.toLocaleString('en-US')

  // Always-LTR layout. Labels remain Arabic; only the chart math is LTR.
  //   bottom-LEFT  = deal (low x, low y)
  //   bottom-RIGHT = secondary (high x, low y)
  //   top-LEFT     = secondary (low x, high y)
  //   top-RIGHT    = avoid (high x, high y)
  const pills = lang === 'ar'
    ? {
        deal:    'منطقة اللقطات',
        bottomR: 'سعر أعلى، ممشى أقل',
        topL:    'سعر أقل، ممشى أعلى',
        avoid:   'أعلى من السوق',
      }
    : {
        deal:    'Deal zone',
        bottomR: 'Higher price, lower km',
        topL:    'Lower price, higher km',
        avoid:   'Above market',
      }
  const xTitle = lang === 'ar' ? 'السعر (ريال) →' : 'Price (SAR) →'
  const yTitle = lang === 'ar' ? '↑ الممشى (كم)'   : '↑ Mileage (km)'

  return (
    <div className="hunt-plot-wrap" style={{ width: '100%' }}>
      <style>{`
        .hunt-plot       { height: 400px; }
        @media (max-width: 767px) {
          .hunt-plot     { height: 320px; }
        }
      `}</style>

      {/* Row above the chart frame:
            - RIGHT (RTL first child) → model legend panel
            - LEFT  (RTL last child)  → Y axis title, hugging the gradient
              strip's vertical column below.
          On <md the legend wraps onto a new line above the title to keep
          the layout legible on narrow screens. */}
      <div
        className="flex items-end justify-between flex-wrap gap-2"
        style={{ marginBottom: 8 }}
      >
        <ModelLegend points={points} />
        <span style={{
          color: NAVY_900, fontSize: 18, fontWeight: 800,
          marginInlineEnd: 8,    // RTL: nudges left edge inward to align with the gradient strip at left:8 inside the frame
        }}>
          {yTitle}
        </span>
      </div>

      {/* Chart frame — forced LTR so Recharts internal coordinate math
          isn't fighting the surrounding document direction. */}
      <div
        ref={containerRef}
        className="relative"
        dir="ltr"
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
                orientation="left"
              />
              {/* SINGLE Scatter for all points — color comes from each datum.
                  Drawing in a single SVG layer fixes the cross-group hover
                  occlusion bug from the previous N-Scatter implementation. */}
              <Scatter
                data={points}
                isAnimationActive={false}
                shape={dotShape}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Direction-cue gradient strips. Concrete-not-abstract labels
            at each end so the user reads what each gradient direction
            actually means without needing to interpret an arrow. */}
        {xMid > 0 && yMid > 0 && (
          <>
            {/* Vertical strip — leftmost element inside the frame.
                Emerald (low km / better) at the bottom → amber at the top. */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                top: 32, bottom: 56,
                left: 8, width: 12,
                borderRadius: 999,
                background: 'linear-gradient(to top, #10B981 0%, #F59E0B 100%)',
                opacity: 0.40,
                zIndex: 5,
              }}
            />
            {/* Top label (amber) */}
            <span
              style={{
                position: 'absolute',
                top: 14, left: 2,
                color: '#B45309',
                fontSize: 11, fontWeight: 700,
                background: 'rgba(255,255,255,0.85)',
                padding: '1px 5px',
                borderRadius: 4,
                zIndex: 6,
                pointerEvents: 'none',
              }}
            >
              ممشى أعلى
            </span>
            {/* Bottom label (emerald) */}
            <span
              style={{
                position: 'absolute',
                bottom: 40, left: 2,
                color: '#047857',
                fontSize: 11, fontWeight: 700,
                background: 'rgba(255,255,255,0.85)',
                padding: '1px 5px',
                borderRadius: 4,
                zIndex: 6,
                pointerEvents: 'none',
              }}
            >
              ممشى أقل
            </span>

            {/* Horizontal strip — below the X axis tick numbers.
                Emerald (cheaper / better) at the left → amber at the right. */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left: 104, right: 28,
                bottom: 6, height: 12,
                borderRadius: 999,
                background: 'linear-gradient(to right, #10B981 0%, #F59E0B 100%)',
                opacity: 0.40,
                zIndex: 5,
              }}
            />
            <span
              style={{
                position: 'absolute',
                left: 108, bottom: 4,
                color: '#047857',
                fontSize: 11, fontWeight: 700,
                background: 'rgba(255,255,255,0.85)',
                padding: '1px 5px',
                borderRadius: 4,
                zIndex: 6,
                pointerEvents: 'none',
              }}
            >
              سعر أرخص
            </span>
            <span
              style={{
                position: 'absolute',
                right: 32, bottom: 4,
                color: '#B45309',
                fontSize: 11, fontWeight: 700,
                background: 'rgba(255,255,255,0.85)',
                padding: '1px 5px',
                borderRadius: 4,
                zIndex: 6,
                pointerEvents: 'none',
              }}
            >
              سعر أغلى
            </span>
          </>
        )}

        {/* Off-chart indicator — top-right inside the frame so it doesn't
            collide with the X-axis gradient strip running along the bottom. */}
        {offChartCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 8, right: 24,
              color: SLATE, fontSize: 11, fontWeight: 600,
              background: 'rgba(255,255,255,0.92)',
              padding: '2px 8px',
              borderRadius: 999,
              pointerEvents: 'none',
              zIndex: 25,
            }}
          >
            {offChartCount} {lang === 'ar' ? 'سيارة خارج المخطط' : `cars off-chart`}
          </span>
        )}

        {/* Custom tooltip — looked up by hoverId from chart.byId, never
            from a Recharts payload. Positioned in container-local coords
            so we can guarantee it tracks the cursor and survives data
            changes (hoverId is cleared whenever the rendered set
            mutates, so a stale tooltip from a now-vanished dot is
            impossible). */}
        {hoverPoint && hoverXY && (
          <ChartTooltip point={hoverPoint} xy={hoverXY} />
        )}
      </div>

      {/* Zone legend strip — sized up so it reads at a glance instead of
          requiring a squint. RTL order so the deal-zone swatch (green)
          comes first under Arabic. */}
      {xMid > 0 && yMid > 0 && (
        <div
          dir="rtl"
          className="flex flex-wrap items-center justify-center"
          style={{
            marginTop: 12,
            background: SLATE_50,
            borderTop: `1px solid ${SLATE_200}`,
            padding: '14px 20px',
            borderRadius: 12,
            columnGap: 32,
            rowGap: 8,
          }}
        >
          <LegendEntry text={pills.deal}    fill="#ECFDF5" stroke="#10B981" />
          <LegendEntry text={pills.topL}    fill="#FFFBEB" stroke="#F59E0B" />
          <LegendEntry text={pills.bottomR} fill="#F8FAFC" stroke={SLATE_400} />
          <LegendEntry text={pills.avoid}   fill="#FFF1F2" stroke="#F43F5E" />
        </div>
      )}

      {/* X axis title below the legend */}
      <div className="flex" style={{
        color: NAVY_900, fontSize: 18, fontWeight: 800,
        marginTop: 12, justifyContent: 'center',
      }}>
        {xTitle}
      </div>
    </div>
  )
}

// Model legend — sits in the top-right above the chart frame so it
// doesn't compete with the in-chart axis annotations. Vertical stack of
// one entry per model, right-aligned for RTL reading.
function ModelLegend ({ points }: { points: ChartPoint[] }) {
  const items = useMemo(() => {
    const map = new Map<string, { color: string; label: string; count: number }>()
    for (const p of points) {
      const cur = map.get(p.modelColor)
      if (cur) cur.count++
      else map.set(p.modelColor, { color: p.modelColor, label: p.modelLabel, count: 1 })
    }
    return [...map.values()]
  }, [points])
  if (items.length === 0) return <span />
  return (
    <div
      className="inline-flex flex-col gap-1"
      style={{
        background: SLATE_50,
        borderRadius: 10,
        padding: 8,
        alignItems: 'flex-end',    // right-align entries
      }}
    >
      {items.map(it => (
        <span key={it.color} className="inline-flex items-center gap-1.5">
          <span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, background: it.color }} />
          <span style={{ color: '#1E293B', fontSize: 14, fontWeight: 700 }}>{it.label}</span>
          <span style={{ color: SLATE, fontSize: 12, fontWeight: 500 }}>({it.count})</span>
        </span>
      ))}
    </div>
  )
}

function LegendEntry ({ text, fill, stroke }: { text: string; fill: string; stroke: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        aria-hidden
        style={{
          width: 16, height: 16, borderRadius: 4,
          background: fill, border: `1px solid ${stroke}`,
          display: 'inline-block', flexShrink: 0,
        }}
      />
      <span style={{ color: '#1E293B', fontSize: 14, fontWeight: 700 }}>
        {text}
      </span>
    </span>
  )
}

// (CornerPill / PillPos types were removed when the in-chart zone pills
// were replaced by the legend strip below the chart frame.)

// ─── Custom tooltip (renders our own; we don't use Recharts <Tooltip>) ─────
function ChartTooltip ({ point, xy }: { point: ChartPoint; xy: { x: number; y: number } }) {
  const l = point.listing
  const photo = (l.photo_urls?.[0]) ?? null
  // Offset so the tooltip doesn't sit on top of the cursor.
  const left = Math.max(8, xy.x + 14)
  const top  = Math.max(8, xy.y + 14)
  return (
    <div
      role="tooltip"
      dir="rtl"
      style={{
        position: 'absolute',
        left, top,
        background: '#FFFFFF',
        border: `1px solid ${SLATE_200}`,
        borderRadius: 12,
        boxShadow: '0 12px 28px rgba(15,23,42,0.18)',
        padding: 10,
        display: 'flex',
        gap: 10,
        maxWidth: 280,
        zIndex: 40,
        pointerEvents: 'none',
      }}
    >
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt=""
          width={60} height={60}
          style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
          referrerPolicy="no-referrer"
        />
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: NAVY, fontWeight: 800 }}>
          {l.year} {l.make_ar ?? l.make_en} {l.model_ar ?? l.model_en}
        </div>
        <div style={{ fontSize: 13, color: NAVY, fontWeight: 900, marginTop: 2, direction: 'ltr', textAlign: 'right' }}>
          {l.price_sar?.toLocaleString()} <span style={{ fontSize: 10, color: SLATE, fontWeight: 600 }}>ريال</span>
        </div>
        <div style={{ fontSize: 11, color: SLATE, marginTop: 2 }}>
          {l.mileage_km?.toLocaleString()} كم · {l.city_ar ?? l.city_en ?? '-'} · {l.source}
        </div>
      </div>
    </div>
  )
}
