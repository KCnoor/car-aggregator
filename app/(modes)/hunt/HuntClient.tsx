'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Target, AlertCircle, Scale, MousePointer2, Pin, Sparkles, Layers,
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

type SortKey = 'score' | 'price' | 'mileage' | 'year'

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
  presentMakeSlugs = [],
  presentModelKeys = [],
}: {
  initialSpecs: SlotSpec[]
  initialPerSlot: Listing[][]
  canonicalMakes: CanonicalMake[]
  canonicalModels: CanonicalModel[]
  // Corpus-presence facets from the server (15k floor applied). The slot
  // dropdowns surface only makes/models that have ≥1 current listing —
  // so picking a make never opens a "this brand has no cars" dead end.
  presentMakeSlugs?: string[]
  presentModelKeys?: string[]  // "<make_slug>|<model_slug>"
}) {
  const router = useRouter()
  const { lang } = useLang()

  const [slots, setSlots] = useState<Slot[]>(() => {
    const seeded: Slot[] = Array(MAX_SLOTS).fill(null)
    initialSpecs.slice(0, MAX_SLOTS).forEach((s, i) => { seeded[i] = s })
    return seeded
  })
  const [perSlot, setPerSlot] = useState<Listing[][]>(initialPerSlot)
  // Canonical selection state. Stored as a string[] (not Set) so click
  // order is preserved for the comparison strip and so the array
  // identity changes on every update (Sets are mutable + reference-stable
  // which used to trip React's bailout heuristics in dev).
  const [selectedListingIds, setSelectedListingIds] = useState<string[]>([])
  // Default sort for the strip.
  const [sortKey, setSortKey] = useState<SortKey>('score')
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
    setSelectedListingIds([])
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
    setSelectedListingIds([]); setHoverId(null); setHoverXY(null)
  }
  function setSlotYears (idx: number, yearMin: number, yearMax: number) {
    setSlots(prev => {
      const cur = prev[idx]
      if (!cur) return prev
      const next = [...prev]
      next[idx] = { ...cur, yearMin, yearMax }
      return next
    })
    setSelectedListingIds([]); setHoverId(null); setHoverXY(null)
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
    setSelectedListingIds(prev => {
      const next = prev.filter(id => renderedIds.has(id))
      return next.length === prev.length ? prev : next
    })
    setHoverId(prev => (prev && !renderedIds.has(prev) ? null : prev))
  }, [chart.rendered])

  // Toast state — surfaces when the user tries to pin a 9th car.
  // Self-clears after 3 seconds. Side effects live outside the
  // setSelectedListingIds updater so they don't double-fire under
  // StrictMode.
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(id)
  }, [toast])

  // Click → pin (max 8). Click again → unpin. Out-of-room → toast.
  const PIN_CAP = 8
  function togglePin (id: string) {
    setSelectedListingIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= PIN_CAP) {
        // Defer toast surfaces to a microtask so we never call setState
        // from inside another setState updater.
        queueMicrotask(() => setToast('وصلت الحد الأقصى — ٨ سيارات للمقارنة'))
        return prev
      }
      return [...prev, id]
    })
  }

  // ── Strip data ───────────────────────────────────────────────────────────
  // Strict invariant: the strip iterates over the EXACT same set of
  // listings that's plotted in the chart. The default 12-cap was the
  // source of the "chart shows 24, strip shows 12" mismatch — gone.
  //   - No pins      → every chart.rendered listing, sorted by deal_score
  //   - 1–4 pins     → only those listings, in click order
  const stripListings: Listing[] = useMemo(() => {
    // Step 1 — pick the visible set: pinned subset if any, else all chart points.
    let visible: Listing[]
    if (selectedListingIds.length > 0) {
      visible = selectedListingIds
        .map(id => chart.byId.get(id)?.listing)
        .filter(Boolean) as Listing[]
    } else {
      visible = chart.rendered.map(p => p.listing)
    }
    // Step 2 — apply sort. Stable copy so the original chart order isn't disturbed.
    const sorted = [...visible]
    switch (sortKey) {
      case 'score':   sorted.sort((a, b) => (b.deal_score ?? -1) - (a.deal_score ?? -1)); break
      case 'price':   sorted.sort((a, b) => (a.price_sar  ??  Infinity) - (b.price_sar  ??  Infinity)); break
      case 'mileage': sorted.sort((a, b) => (a.mileage_km ??  Infinity) - (b.mileage_km ??  Infinity)); break
      case 'year':    sorted.sort((a, b) => (b.year       ??  0) - (a.year       ??  0)); break
    }
    return sorted
  }, [selectedListingIds, chart, sortKey])

  // Look up the listing's slot color when rendering the comparison strip
  // (must match the dot's color so the user can tell which slot a card
  // came from).
  const colorOf = useCallback((id: string) => chart.byId.get(id)?.modelColor ?? CORAL, [chart])

  // Hover/tooltip data — derived strictly from hoverId via byId, never
  // from Recharts payloads (that was the source of the cross-wired tooltip
  // bug).
  const hoverPoint = hoverId ? chart.byId.get(hoverId) ?? null : null

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen" style={{ background: 'var(--bg-page)' }}>
      {/* ── Intro + tips ── */}
      <section className="max-w-screen-xl mx-auto px-4" style={{ paddingTop: 40, paddingBottom: 24 }}>
        <div className="grid grid-cols-1 md:grid-cols-[55fr_45fr] gap-6">
          <div>
            <h1 className="leading-tight" style={{ color: NAVY_900, fontSize: 40, fontWeight: 900 }}>
              {lang === 'ar' ? 'الصياد' : 'The Hunter'}
            </h1>
            <p className="mt-3" style={{ color: SLATE_700, fontSize: 20, fontWeight: 600 }}>
              {lang === 'ar'
                ? 'تعرف وش تبي، بس تدور اللقطة.'
                : "You know what you want — you're hunting for the catch."}
            </p>
            <p className="mt-2 max-w-prose" style={{ color: SLATE, fontSize: 16, lineHeight: 1.7 }}>
              {lang === 'ar'
                ? 'اختر حتى ٥ موديلات في الخانات تحت، وشوف على المخطط وين السيارات الأرخص والممشى الأقل. حوم على نقطة لتفاصيلها، واضغط لتثبيت ما يصل إلى ٨ سيارات للمقارنة.'
                : 'Pick up to 5 models in the slots below and see on the chart where the cheapest, lowest-mileage cars sit. Hover a dot for details, click to pin up to 8 cars for comparison.'}
            </p>
          </div>
          <UsageTips lang={lang} />
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
              presentMakeSlugs={presentMakeSlugs}
              presentModelKeys={presentModelKeys}
              lang={lang}
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
          <TooManyModelsBanner lang={lang} onDismiss={dismissTooMany} />
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
            <EmptyState lang={lang} />
          ) : chart.rendered.length < 1 ? (
            <div
              className="flex items-center justify-center text-center"
              style={{ height: 360, color: SLATE, fontSize: 14 }}
            >
              {lang === 'ar'
                ? 'ما لقينا سيارات في هذا المدى. وسّع السنوات أو غيّر الموديلات.'
                : "No cars found in this range. Widen the years or pick different models."}
            </div>
          ) : (
            <HuntChart
              points={chart.rendered}
              xMin={chart.xMin} xMax={chart.xMax}
              yMin={chart.yMin} yMax={chart.yMax}
              xStep={chart.xStep} yStep={chart.yStep}
              xMid={chart.xMid} yMid={chart.yMid}
              hoverId={hoverId}
              selectedIds={selectedListingIds}
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
          {/* Bridge — copy + clear control depend on the selection state. */}
          <div
            className="rounded-2xl flex items-center justify-between flex-wrap gap-2"
            style={{
              background: SLATE_50,
              padding: 12,
              marginBottom: 12,
              color: SLATE_700,
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            <span>
              <span aria-hidden style={{ marginInlineEnd: 8 }}>👇</span>
              {lang === 'ar'
                ? (selectedListingIds.length > 0
                    ? <>السيارات للمقارنة ({selectedListingIds.length} من ٨)</>
                    : <>السيارات في المخطط ({chart.rendered.length} سيارة)</>)
                : (selectedListingIds.length > 0
                    ? <>Cars for comparison ({selectedListingIds.length} of 8)</>
                    : <>Cars on the chart ({chart.rendered.length})</>)}
            </span>
            {selectedListingIds.length > 0 && (
              <button
                onClick={() => setSelectedListingIds([])}
                className="inline-flex items-center gap-1"
                style={{
                  color: CORAL,
                  fontSize: 14,
                  fontWeight: 700,
                  textDecoration: 'underline',
                }}
              >
                {lang === 'ar' ? 'عرض الكل ↩' : 'Show all ↩'}
              </button>
            )}
          </div>

          {/* Sort pill row — controls the order of cards in the strip. */}
          <SortPills value={sortKey} onChange={setSortKey} lang={lang} />

          {selectedListingIds.length > 0 ? (
            // Pinned mode — horizontal scroll. 4 cards visible desktop,
            // 2 on mobile. Each card has a fixed width so the scroll
            // container can overflow horizontally.
            <div
              className="overflow-x-auto no-scrollbar"
              style={{ scrollSnapType: 'x mandatory' }}
              dir="rtl"
            >
              <div className="flex gap-4 pb-2" style={{ minWidth: 'min-content' }}>
                {stripListings.map((l, i) => {
                  const color = colorOf(l.id)
                  return (
                    <div
                      key={l.id}
                      style={{
                        borderInlineStart: `4px solid ${color}`,
                        paddingInlineStart: 8,
                        width: 'var(--cmp-card-w, calc(50% - 8px))',
                        flexShrink: 0,
                        scrollSnapAlign: 'start',
                      }}
                    >
                      <ListingCard listing={l} lang={lang} index={i} />
                    </div>
                  )
                })}
              </div>
              <style>{`
                /* Mobile: 2 cards visible. Desktop: 4 cards visible. */
                :root { --cmp-card-w: calc(50% - 8px); }
                @media (min-width: 768px) {
                  :root { --cmp-card-w: calc(25% - 12px); }
                }
              `}</style>
            </div>
          ) : (
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
          )}
        </section>
      )}

      {/* Toast — auto-dismisses after 3s via the toast effect above. */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          dir="rtl"
          style={{
            position: 'fixed',
            bottom: 24,
            insetInlineEnd: 24,
            background: '#FEF3C7',
            color: '#1E293B',
            fontSize: 14,
            fontWeight: 700,
            padding: '12px 16px',
            borderRadius: 12,
            border: '1px solid #FCD34D',
            boxShadow: '0 14px 32px rgba(15,23,42,0.18)',
            zIndex: 60,
            maxWidth: 320,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}

// ─── Sort pill row ─────────────────────────────────────────────────────────
const SORT_PILLS: { key: SortKey; labelAr: string; labelEn: string }[] = [
  { key: 'score',   labelAr: 'أحسن صفقة',  labelEn: 'Best deal' },
  { key: 'price',   labelAr: 'الأرخص',     labelEn: 'Cheapest' },
  { key: 'mileage', labelAr: 'الأقل ممشى', labelEn: 'Lowest mileage' },
  { key: 'year',    labelAr: 'الأحدث',     labelEn: 'Newest' },
]
function SortPills ({ value, onChange, lang }: { value: SortKey; onChange: (k: SortKey) => void; lang: 'ar' | 'en' }) {
  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="flex flex-wrap items-center gap-2"
      style={{ marginBottom: 12 }}
    >
      <span style={{ color: '#475569', fontSize: 14, fontWeight: 600, marginInlineEnd: 4 }}>
        {lang === 'ar' ? 'ترتيب حسب:' : 'Sort by:'}
      </span>
      {SORT_PILLS.map(p => {
        const active = value === p.key
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange(p.key)}
            aria-pressed={active}
            className="transition-colors"
            style={{
              background: active ? CORAL : '#FFFFFF',
              color: active ? '#FFFFFF' : '#334155',
              border: active ? '1px solid transparent' : '1px solid #E2E8F0',
              borderRadius: 12,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {lang === 'ar' ? p.labelAr : p.labelEn}
          </button>
        )
      })}
    </div>
  )
}

// ─── Banner ─────────────────────────────────────────────────────────────────
function TooManyModelsBanner ({ onDismiss, lang }: { onDismiss: () => void; lang: 'ar' | 'en' }) {
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
        {lang === 'ar'
          ? 'ملاحظة: نقترح مقارنة ٣ موديلات أو أقل من نفس الفئة. كل ما تضيف موديلات مختلفة الحجم أو السعر، كل ما يصير المخطط أقل دقّة.'
          : 'Heads up: we suggest comparing 3 or fewer models from the same class. The more you add models that differ in size or price, the less precise the chart gets.'}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={lang === 'ar' ? 'إغلاق' : 'Dismiss'}
        className="rounded-full w-7 h-7 inline-flex items-center justify-center hover:bg-amber-100 transition-colors flex-shrink-0"
        style={{ color: '#92400E', fontSize: 18, lineHeight: 1 }}
      >
        ×
      </button>
    </div>
  )
}

// ─── Tips panel ─────────────────────────────────────────────────────────────
function UsageTips ({ lang }: { lang: 'ar' | 'en' }) {
  // Tip 4 uses single-click wording because that's the actual
  // behaviour — togglePin runs on every click. Tip 5 sets expectations
  // on the 8-car comparison cap so users don't feel boxed in.
  const TIPS_AR: { Icon: typeof Scale; text: string }[] = [
    { Icon: Scale,         text: 'قارن سيارات من نفس الفئة (مو رولز رويس مع كورولا)' },
    { Icon: Target,        text: 'النتيجة الأوضح بـ ٣ موديلات أو أقل' },
    { Icon: MousePointer2, text: 'حوم على نقطة لتفاصيل السيارة' },
    { Icon: Pin,           text: 'اضغط على النقطة لتثبيت السيارة في المقارنة تحت' },
    { Icon: Layers,        text: 'يمكنك مقارنة حتى ٨ سيارات في وقت واحد' },
    { Icon: Sparkles,      text: 'انتبه وتأكد من اللقطات لا يكونوا قفطات 😉' },
  ]
  const TIPS_EN: { Icon: typeof Scale; text: string }[] = [
    { Icon: Scale,         text: 'Compare cars in the same class (not a Rolls-Royce against a Corolla)' },
    { Icon: Target,        text: 'The picture is clearest with 3 models or fewer' },
    { Icon: MousePointer2, text: 'Hover a dot to see the car details' },
    { Icon: Pin,           text: 'Click a dot to pin the car into the comparison strip below' },
    { Icon: Layers,        text: 'You can compare up to 8 cars at once' },
    { Icon: Sparkles,      text: 'Eyeball the photos — make sure a "deal" is a deal, not a trap 😉' },
  ]
  const TIPS = lang === 'ar' ? TIPS_AR : TIPS_EN
  return (
    <aside
      className="rounded-2xl"
      style={{ background: SLATE_50, border: `1px solid ${SLATE_200}`, padding: 20 }}
    >
      <h3 className="mb-3" style={{ color: SLATE_700, fontSize: 14, fontWeight: 800 }}>
        {lang === 'ar' ? 'كيف تستخدم الصياد؟' : 'How to use the Hunter'}
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
function EmptyState ({ lang }: { lang: 'ar' | 'en' }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-4" style={{ height: 360 }}>
      <Target size={72} strokeWidth={1.2} color={CORAL} style={{ opacity: 0.18, marginBottom: 14 }} />
      <p style={{ color: SLATE_700, fontSize: 17, fontWeight: 600 }}>
        {lang === 'ar'
          ? 'اختر ماركة وموديل في الخانات أعلاه لتشوف المخطط'
          : 'Pick a make and model in the slots above to see the chart'}
      </p>
      <p className="mt-1" style={{ color: SLATE, fontSize: 13 }}>
        {lang === 'ar'
          ? 'يمكنك اختيار حتى ٥ موديلات للمقارنة، كل واحد بنطاق سنوات خاص فيه'
          : 'You can pick up to 5 models for comparison, each with its own year range'}
      </p>
    </div>
  )
}

// ─── Slot card ──────────────────────────────────────────────────────────────
function SlotCard ({
  slotIndex, slot, color,
  canonicalMakes, canonicalModels,
  presentMakeSlugs, presentModelKeys, lang,
  onPickMake, onPickModel, onPickYears, onClear,
}: {
  slotIndex: number
  slot: Slot
  color: string
  canonicalMakes: CanonicalMake[]
  canonicalModels: CanonicalModel[]
  presentMakeSlugs: string[]
  presentModelKeys: string[]
  lang: 'ar' | 'en'
  onPickMake: (slug: string | null) => void
  onPickModel: (slug: string | null) => void
  onPickYears: (lo: number, hi: number) => void
  onClear: () => void
}) {
  const filled = !!slot?.make
  const fullyFilled = !!(slot?.make && slot?.model)
  // Restrict the make dropdown to makes with ≥1 current listing past the
  // 15k floor. The presentMakeSlugs set is computed server-side so the
  // dropdown reflects DB state, not whatever subset the chart happens to
  // be holding.
  const presentMakeSet = useMemo(() => new Set(presentMakeSlugs), [presentMakeSlugs])
  const presentModelSet = useMemo(() => new Set(presentModelKeys), [presentModelKeys])
  const availableMakes = useMemo(
    () => canonicalMakes.filter(m => presentMakeSet.has(m.canonical_make_slug)),
    [canonicalMakes, presentMakeSet],
  )
  const modelsForMake = slot?.make
    ? canonicalModels.filter(m =>
        m.canonical_make_slug === slot.make &&
        presentModelSet.has(`${slot.make}|${m.canonical_model_slug}`),
      )
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
          {lang === 'ar' ? `موديل ${slotIndex + 1}` : `Model ${slotIndex + 1}`}
          {slotIndex >= 3 && (
            <span style={{ color: SLATE_400, fontWeight: 500 }}>
              {lang === 'ar' ? ' (إضافي)' : ' (extra)'}
            </span>
          )}
        </span>
        {fullyFilled && (
          <button
            type="button"
            onClick={onClear}
            aria-label={lang === 'ar' ? 'مسح' : 'Clear'}
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
        <option value="">{lang === 'ar' ? 'الماركة' : 'Make'}</option>
        {availableMakes.map(m => (
          <option key={m.canonical_make_slug} value={m.canonical_make_slug}>
            {lang === 'ar' ? m.canonical_name_ar : m.canonical_name_en}
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
        <option value="">{lang === 'ar' ? 'الموديل' : 'Model'}</option>
        {modelsForMake.map(m => (
          <option key={m.canonical_model_slug} value={m.canonical_model_slug}>
            {lang === 'ar' ? m.canonical_name_ar : m.canonical_name_en}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-1.5">
        <select
          value={yearMin}
          onChange={e => onPickYears(parseInt(e.target.value), Math.max(yearMax, parseInt(e.target.value)))}
          disabled={!fullyFilled}
          aria-label={lang === 'ar' ? 'من' : 'From'}
          style={{
            background: !fullyFilled ? SLATE_50 : '#FFFFFF',
            border: `1px solid ${SLATE_200}`, borderRadius: 8,
            padding: '4px 6px', fontSize: 12, fontWeight: 700, color: NAVY, flex: 1,
          }}
        >
          {YEAR_OPTIONS.map(y => (
            <option key={y} value={y}>{lang === 'ar' ? `من ${y}` : `From ${y}`}</option>
          ))}
        </select>
        <select
          value={yearMax}
          onChange={e => onPickYears(Math.min(yearMin, parseInt(e.target.value)), parseInt(e.target.value))}
          disabled={!fullyFilled}
          aria-label={lang === 'ar' ? 'إلى' : 'To'}
          style={{
            background: !fullyFilled ? SLATE_50 : '#FFFFFF',
            border: `1px solid ${SLATE_200}`, borderRadius: 8,
            padding: '4px 6px', fontSize: 12, fontWeight: 700, color: NAVY, flex: 1,
          }}
        >
          {YEAR_OPTIONS.filter(y => y >= yearMin).map(y => (
            <option key={y} value={y}>{lang === 'ar' ? `إلى ${y}` : `To ${y}`}</option>
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
  hoverId, selectedIds, onHover, onClick,
  offChartCount, lang,
  hoverPoint, hoverXY,
}: {
  points: ChartPoint[]
  xMin: number; xMax: number; yMin: number; yMax: number
  xStep: number; yStep: number
  xMid: number; yMid: number
  hoverId: string | null
  selectedIds: string[]
  onHover: (id: string | null, xy: { x: number; y: number } | null) => void
  onClick: (id: string) => void
  offChartCount: number
  lang: 'ar' | 'en'
  hoverPoint: ChartPoint | null
  hoverXY: { x: number; y: number } | null
}) {
  const anyHover = hoverId !== null
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const containerRef = useRef<HTMLDivElement>(null)

  // Single <Scatter> renders every point. The dot shape reads color +
  // hover + pinned state from the datum stamped with its own listing.id.
  //
  // Pinned visual is intentionally LOUD so the click→pin feedback can't
  // be missed:
  //   - 3px coral stroke (was 3px before but blended with circle rim)
  //   - inner white halo (4px white inner stroke under the coral)
  //   - radius bumped to 12 (vs 9 unpinned, 14 hovered)
  //   - coral drop-shadow filter for a soft glow
  //   - pinned dots also paint AFTER the others in SVG order, so they
  //     sit on top of unpinned dots when overlapping (see render block).
  const dotShape = useCallback((props: { cx?: number; cy?: number; payload?: ChartPoint }) => {
    const { cx, cy, payload } = props
    if (cx == null || cy == null || !payload) return <g />
    const id = payload.id
    const isHover  = hoverId === id
    const isPinned = selectedSet.has(id)
    const r = isPinned ? 12 : isHover ? 14 : 9
    const fillOpacity = anyHover ? (isHover || isPinned ? 1 : 0.25) : 1
    return (
      <g
        style={{
          cursor: 'pointer',
          transition: 'r 0.18s',
          filter: isPinned ? 'drop-shadow(0 0 6px rgba(255,107,74,0.55))' : 'none',
          pointerEvents: 'auto',
        }}
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
        // Belt-and-suspenders: bind BOTH onClick and onPointerDown. Safari
        // desktop sometimes drops `click` on small SVG primitives after a
        // fast tap but reliably fires `pointerdown`. Pointer events also
        // unify mouse + touch + pen on every modern browser.
        onClick={() => onClick(id)}
        onPointerDown={e => {
          // Only treat primary-button pointer events as a click.
          if (e.isPrimary && (e.pointerType === 'mouse' ? e.button === 0 : true)) {
            onClick(id)
          }
        }}
      >
        {/* Invisible larger hit target — the fix for desktop Safari's
            strict SVG per-pixel hit-testing on small <circle> elements.
            Mobile Safari auto-expands touch targets so it worked there;
            desktop Safari and Chrome with precise mice don't. r=18 gives
            a ~36×36 click zone regardless of the visible dot size. */}
        <circle
          cx={cx} cy={cy} r={18}
          fill="transparent"
          stroke="none"
          style={{ pointerEvents: 'all' }}
        />
        {/* White halo behind the coral border so the ring reads against
            similar-color zone backgrounds. */}
        {isPinned && (
          <circle cx={cx} cy={cy} r={r + 2} fill="none" stroke="#FFFFFF" strokeWidth={4} pointerEvents="none" />
        )}
        <circle
          cx={cx} cy={cy} r={r}
          fill={payload.modelColor}
          fillOpacity={fillOpacity}
          stroke={isPinned ? CORAL : '#FFFFFF'}
          strokeWidth={isPinned ? 3 : 1}
          pointerEvents="none"
        />
      </g>
    )
  }, [hoverId, selectedSet, anyHover, onHover, onClick])

  // Render pinned dots LAST so they paint on top of unpinned siblings.
  // SVG has no z-index; document order wins, so we reorder the data.
  const orderedPoints = useMemo(() => {
    if (selectedIds.length === 0) return points
    const pinned: ChartPoint[] = []
    const rest: ChartPoint[] = []
    for (const p of points) {
      if (selectedSet.has(p.id)) pinned.push(p)
      else rest.push(p)
    }
    return [...rest, ...pinned]
  }, [points, selectedSet, selectedIds.length])

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
                data={orderedPoints}
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

            {/* Horizontal X gradient strip moved OUT of the chart frame
                — see the band below the X axis title in the parent
                stack. The vertical Y strip above is unchanged. */}
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
          <ChartTooltip point={hoverPoint} xy={hoverXY} lang={lang} />
        )}
      </div>

      {/* X axis title — sits immediately below the chart frame, above
          the price-gradient strip (the gradient now belongs with the
          axis it describes, not with the zone color key). */}
      <div className="flex" style={{
        color: NAVY_900, fontSize: 18, fontWeight: 800,
        marginTop: 8, justifyContent: 'center',
      }}>
        {xTitle}
      </div>

      {/* External horizontal price gradient — emerald (cheaper) on the
          left, amber (more expensive) on the right. Inset to roughly
          match the chart's plot-area horizontal extent (88px left for
          the YAxis area + 16px right margin). */}
      {xMid > 0 && yMid > 0 && (
        <div
          className="relative"
          style={{
            marginTop: 8,
            paddingInlineStart: 88,
            paddingInlineEnd: 16,
            height: 22,
          }}
        >
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: 88, right: 16,
              top: 4, height: 12,
              borderRadius: 999,
              background: 'linear-gradient(to right, #10B981 0%, #F59E0B 100%)',
              opacity: 0.55,
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: 92, top: 2,
              color: '#047857',
              fontSize: 11, fontWeight: 700,
              background: 'rgba(255,255,255,0.92)',
              padding: '1px 5px',
              borderRadius: 4,
            }}
          >
            {lang === 'ar' ? 'سعر أرخص' : 'Cheaper'}
          </span>
          <span
            style={{
              position: 'absolute',
              right: 20, top: 2,
              color: '#B45309',
              fontSize: 11, fontWeight: 700,
              background: 'rgba(255,255,255,0.92)',
              padding: '1px 5px',
              borderRadius: 4,
            }}
          >
            {lang === 'ar' ? 'سعر أغلى' : 'Pricier'}
          </span>
        </div>
      )}

      {/* Zone legend — now the bottom-most chart-related element.
          Separated from the price gradient by 8px so the two read as
          distinct concepts (gradient = direction; squares = zone key). */}
      {xMid > 0 && yMid > 0 && (
        <div
          dir="rtl"
          className="flex flex-wrap items-center justify-center"
          style={{
            marginTop: 8,
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
function ChartTooltip ({ point, xy, lang }: { point: ChartPoint; xy: { x: number; y: number }; lang: 'ar' | 'en' }) {
  const l = point.listing
  const photo = (l.photo_urls?.[0]) ?? null
  // Offset so the tooltip doesn't sit on top of the cursor.
  const left = Math.max(8, xy.x + 14)
  const top  = Math.max(8, xy.y + 14)
  const make  = lang === 'ar' ? (l.make_ar  ?? l.make_en)  : (l.make_en  ?? l.make_ar)
  const model = lang === 'ar' ? (l.model_ar ?? l.model_en) : (l.model_en ?? l.model_ar)
  const city  = lang === 'ar' ? (l.city_ar ?? l.city_en ?? '-') : (l.city_en ?? l.city_ar ?? '-')
  return (
    <div
      role="tooltip"
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
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
          {l.year} {make} {model}
        </div>
        <div style={{ fontSize: 13, color: NAVY, fontWeight: 900, marginTop: 2, direction: 'ltr', textAlign: lang === 'ar' ? 'right' : 'left' }}>
          {l.price_sar?.toLocaleString()} <span style={{ fontSize: 10, color: SLATE, fontWeight: 600 }}>{lang === 'ar' ? 'ريال' : 'SAR'}</span>
        </div>
        <div style={{ fontSize: 11, color: SLATE, marginTop: 2 }}>
          {l.mileage_km?.toLocaleString()} {lang === 'ar' ? 'كم' : 'km'} · {city} · {l.source}
        </div>
      </div>
    </div>
  )
}
