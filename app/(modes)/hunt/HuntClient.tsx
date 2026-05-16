'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ComposedChart, Scatter, Line, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip,
} from 'recharts'
import type { Listing } from '@/lib/supabase'
import ListingCard from '@/app/components/ListingCard'
import { type Bundle, MODEL_COLORS } from './bundles'

const CORAL  = '#FF6B4A'
const NAVY   = '#1E293B'
const SLATE  = '#64748B'
const SLATE_100 = '#F1F5F9'
const SLATE_200 = '#E2E8F0'

type ModelKey = { make: string; model: string }
type SelectedModel = ModelKey & {
  color: string
  labelAr: string         // resolved at runtime from listings
  listings: Listing[]
}

const MAX_MODELS = 5
const YEAR_OPTIONS = Array.from({ length: 2026 - 2005 + 1 }, (_, i) => 2026 - i)
const HELPER_DISMISS_KEY = 'hunt_helper_dismissed'
const POINT_CAP = 80

function modelTokenOf (l: Listing) {
  return `${l.make_slug ?? ''}|${l.model_slug ?? ''}`
}

// Simple least-squares regression for the per-model dashed line.
// Returns null when n < 5 or all x identical.
function regress (points: { x: number; y: number }[]) {
  if (points.length < 5) return null
  const n = points.length
  let sx = 0, sy = 0, sxx = 0, sxy = 0
  for (const p of points) { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y }
  const denom = n * sxx - sx * sx
  if (denom === 0) return null
  const slope = (n * sxy - sx * sy) / denom
  const intercept = (sy - slope * sx) / n
  return { slope, intercept }
}

function percentile (sorted: number[], p: number) {
  if (sorted.length === 0) return 0
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)))
  return sorted[i]
}

// Resolve a label for a model from its listings: prefer Arabic name, then EN.
function arabicLabelFor (listings: Listing[]): string {
  if (!listings.length) return ''
  const a = listings[0]
  const make  = a.make_ar  || a.make_en  || a.make_slug  || ''
  const model = a.model_ar || a.model_en || a.model_slug || ''
  return `${make} ${model}`.trim()
}

export default function HuntClient ({
  initialModels,
  initialYearMin,
  initialYearMax,
  initialBundleId,
  initialListings,
  bundles,
}: {
  initialModels: ModelKey[]
  initialYearMin: number
  initialYearMax: number
  initialBundleId: string | null
  initialListings: Listing[]
  bundles: Bundle[]
}) {
  const router = useRouter()
  const params = useSearchParams()

  const [models,  setModels]  = useState<ModelKey[]>(initialModels)
  const [yearMin, setYearMin] = useState(initialYearMin)
  const [yearMax, setYearMax] = useState(initialYearMax)
  const [activeBundleId, setActiveBundleId] = useState<string | null>(initialBundleId)
  const [listings, setListings] = useState<Listing[]>(initialListings)
  const [pinned, setPinned] = useState<string[]>([])    // listing ids
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [helperDismissed, setHelperDismissed] = useState(false)

  useEffect(() => {
    try { setHelperDismissed(window.localStorage.getItem(HELPER_DISMISS_KEY) === '1') } catch {}
  }, [])

  // Whenever the selection changes via the UI we push a new URL and let
  // the server reload listings. Initial render uses props directly so no
  // round-trip is required on first paint.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    const modelsQ = models.map(m => `${m.make}-${m.model}`).join(',')
    const yearsQ  = `${yearMin}-${yearMax}`
    const next = `/hunt?models=${encodeURIComponent(modelsQ)}&years=${encodeURIComponent(yearsQ)}`
    router.replace(next, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, yearMin, yearMax])

  // Pull a fresh listings snapshot whenever the URL params change. The
  // server component prepared `initialListings` for the URL we landed on,
  // so this only kicks in for subsequent selection edits.
  useEffect(() => {
    setListings(initialListings)
  }, [initialListings])

  // Bucket listings by model in selection order so colors / regression
  // lines align with the chips.
  const grouped: SelectedModel[] = useMemo(() => {
    return models.slice(0, MAX_MODELS).map((m, idx) => {
      const matching = listings.filter(l => l.make_slug === m.make && l.model_slug === m.model)
      return {
        ...m,
        color: MODEL_COLORS[idx] ?? CORAL,
        labelAr: arabicLabelFor(matching) || `${m.make} ${m.model}`,
        listings: matching,
      }
    })
  }, [models, listings])

  // Build point set with axis percentile clipping for chart fitness.
  const chart = useMemo(() => {
    const all = grouped.flatMap(g => g.listings)
    if (all.length === 0) {
      return {
        pointsByModel: [] as ChartGroup[],
        xMin: 0, xMax: 0, yMin: 0, yMax: 0,
        clippedCount: 0, totalCount: 0,
      }
    }
    const prices = [...all.map(l => l.price_sar!).filter(Number.isFinite)].sort((a, b) => a - b)
    const miles  = [...all.map(l => l.mileage_km!).filter(Number.isFinite)].sort((a, b) => a - b)
    const xMin = percentile(prices, 5)
    const xMax = percentile(prices, 95)
    const yMin = 0   // always start at zero km
    const yMax = percentile(miles, 95)
    const inRange = (l: Listing) =>
      l.price_sar! >= xMin && l.price_sar! <= xMax &&
      l.mileage_km! <= yMax
    const pointsByModel: ChartGroup[] = grouped.map(g => {
      const inWindow = g.listings.filter(inRange)
      const data = inWindow.map(l => ({
        x: l.price_sar!,
        y: l.mileage_km!,
        id: l.id,
        listing: l,
      }))
      const reg = regress(data.map(d => ({ x: d.x, y: d.y })))
      const lines = reg ? [
        { x: xMin, y: Math.max(0, reg.slope * xMin + reg.intercept) },
        { x: xMax, y: Math.max(0, reg.slope * xMax + reg.intercept) },
      ] : null
      return { color: g.color, label: g.labelAr, data, lines }
    })
    const totalInRange = pointsByModel.reduce((acc, m) => acc + m.data.length, 0)
    const clippedCount = all.length - totalInRange
    // Cap to POINT_CAP across all models — drop the lowest-score tail.
    if (totalInRange > POINT_CAP) {
      // Sort all in-range points by deal_score desc and keep top POINT_CAP.
      const ranked = pointsByModel.flatMap(m => m.data.map(d => ({ ...d, color: m.color }))).sort((a, b) =>
        ((b.listing.deal_score ?? -1) - (a.listing.deal_score ?? -1))
      ).slice(0, POINT_CAP)
      const keep = new Set(ranked.map(r => r.id))
      for (const m of pointsByModel) m.data = m.data.filter(d => keep.has(d.id))
    }
    return { pointsByModel, xMin, xMax, yMin, yMax, clippedCount, totalCount: all.length }
  }, [grouped])

  function applyBundle (b: Bundle) {
    setActiveBundleId(b.id)
    setModels(b.models)
    setPinned([])
  }
  function removeModel (idx: number) {
    setModels(prev => prev.filter((_, i) => i !== idx))
    setActiveBundleId(null)
  }
  function addModel (m: ModelKey) {
    setModels(prev => {
      if (prev.length >= MAX_MODELS) return prev
      if (prev.some(p => p.make === m.make && p.model === m.model)) return prev
      return [...prev, m]
    })
    setActiveBundleId(null)
  }
  function togglePin (id: string) {
    setPinned(prev => {
      if (prev.includes(id)) return prev.filter(p => p !== id)
      if (prev.length >= 4)  return prev
      return [...prev, id]
    })
  }
  function dismissHelper () {
    setHelperDismissed(true)
    try { window.localStorage.setItem(HELPER_DISMISS_KEY, '1') } catch {}
  }

  const totalPointsRendered = chart.pointsByModel.reduce((acc, m) => acc + m.data.length, 0)
  const tooFew = totalPointsRendered < 5

  const pinnedListings = useMemo(
    () => pinned.map(id => listings.find(l => l.id === id)).filter(Boolean) as Listing[],
    [pinned, listings],
  )

  // Comparison strip data: pinned set when non-empty, otherwise top 8.
  const stripListings: Listing[] = useMemo(() => {
    if (pinned.length > 0) return pinnedListings
    return listings.slice(0, 8)
  }, [pinned, pinnedListings, listings])

  return (
    <div dir="rtl" className="min-h-screen" style={{ background: 'var(--bg-page)' }}>
      {/* ── Intro strip ── */}
      <section className="max-w-screen-xl mx-auto px-4" style={{ paddingTop: 32, paddingBottom: 24 }}>
        <h1 className="font-extrabold leading-tight" style={{ color: NAVY, fontSize: 32, fontWeight: 800 }}>
          الصياد
        </h1>
        <p className="mt-2" style={{ color: SLATE, fontSize: 16 }}>
          تعرف وش تبي، بس تدور اللقطة. اختر حتى ٥ موديلات وشوف وين اللقطات الحقيقية.
        </p>
      </section>

      {/* ── Bundle pills ── */}
      <section className="max-w-screen-xl mx-auto px-4 pb-3">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {bundles.map(b => {
            const isActive = activeBundleId === b.id
            return (
              <button
                key={b.id}
                onClick={() => applyBundle(b)}
                className="flex-shrink-0 transition-transform hover:-translate-y-0.5"
                style={{
                  background: isActive ? CORAL : '#FFFFFF',
                  color: isActive ? '#FFFFFF' : NAVY,
                  border: `1px solid ${isActive ? CORAL : SLATE_200}`,
                  borderRadius: 16,
                  padding: '12px 20px',
                  fontSize: 14,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
                }}
                aria-pressed={isActive}
              >
                {b.labelAr}
              </button>
            )
          })}
          <CustomBundleAdder
            onAdd={m => {
              applyBundle({ id: 'custom', labelAr: 'مخصص', models: [m] })
            }}
            disabled={false}
          />
        </div>
      </section>

      {/* ── Year range + selected model chips ── */}
      <section className="max-w-screen-xl mx-auto px-4 pb-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-5">
          <div className="flex items-center gap-2 shrink-0">
            <YearSelect label="من" value={yearMin} max={yearMax} onChange={v => { setYearMin(v); setActiveBundleId(null) }} />
            <YearSelect label="إلى" value={yearMax} min={yearMin} onChange={v => { setYearMax(v); setActiveBundleId(null) }} />
          </div>

          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
            {grouped.map((g, idx) => (
              <span
                key={`${g.make}-${g.model}`}
                className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-bold"
                style={{
                  background: '#FFFFFF',
                  border: `1px solid ${g.color}80`,
                  color: NAVY,
                }}
              >
                <span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, background: g.color }} />
                {g.labelAr} <span style={{ color: SLATE, fontSize: 12 }}>({g.listings.length})</span>
                <button
                  onClick={() => removeModel(idx)}
                  aria-label="إزالة"
                  className="inline-flex items-center justify-center rounded-full w-5 h-5 hover:bg-slate-100"
                  style={{ color: SLATE }}
                >
                  ×
                </button>
              </span>
            ))}
            {models.length === 0 && (
              <span style={{ color: SLATE, fontSize: 13 }}>
                اختر باكج جاهز فوق أو أضف موديل يدويًا
              </span>
            )}
            {models.length > 0 && models.length < MAX_MODELS && (
              <CustomBundleAdder onAdd={m => addModel(m)} disabled={false} inline />
            )}
          </div>
        </div>
      </section>

      {/* ── Chart ── */}
      <section className="max-w-screen-xl mx-auto px-4 pb-4">
        <div
          className="rounded-2xl"
          style={{
            background: '#FFFFFF',
            border: `1px solid ${SLATE_200}`,
            padding: 24,
            boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
          }}
        >
          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
            <div className="flex items-baseline gap-3 text-[12px]" style={{ color: SLATE }}>
              <span>السعر (ريال) ↓</span>
              <span>الممشى (كم) ↑</span>
            </div>
            <div className="flex flex-wrap gap-3 text-[12px]" style={{ color: NAVY }}>
              {grouped.map(g => (
                <span key={`${g.make}-${g.model}`} className="inline-flex items-center gap-1.5">
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: g.color }} />
                  {g.labelAr}
                </span>
              ))}
            </div>
          </div>

          {tooFew ? (
            <EmptyChartState message="محتاج مدى أكبر — وسّع السنوات أو أضف موديل" />
          ) : (
            <HuntChart
              groups={chart.pointsByModel}
              xMin={chart.xMin}
              xMax={chart.xMax}
              yMin={chart.yMin}
              yMax={chart.yMax}
              hoverId={hoverId}
              pinned={pinned}
              onHover={setHoverId}
              onClick={togglePin}
            />
          )}

          <div className="flex items-center justify-between gap-2 mt-3 flex-wrap text-[12px]" style={{ color: SLATE }}>
            <span>
              {totalPointsRendered} سيارة معروضة
              {chart.totalCount > totalPointsRendered && (
                <> · {chart.totalCount - totalPointsRendered} خارج المخطط</>
              )}
            </span>
            {!helperDismissed && (
              <div className="inline-flex items-center gap-2">
                <span>كل نقطة سيارة. الأسفل-اليسار = أرخص + ممشى أقل. الخط المنقّط لكل موديل = متوسط السوق.</span>
                <button
                  onClick={dismissHelper}
                  aria-label="إخفاء التعليمات"
                  className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-slate-100"
                  style={{ color: SLATE }}
                >
                  ×
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Comparison strip ── */}
      <section className="max-w-screen-xl mx-auto px-4 pb-12">
        {stripListings.length > 0 && (
          <div
            className="rounded-2xl"
            style={{
              background: '#FFFFFF',
              border: `1px solid ${SLATE_200}`,
              padding: 24,
              boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
              marginTop: 16,
            }}
          >
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-extrabold" style={{ color: NAVY, fontSize: 18, fontWeight: 800 }}>
                {pinned.length > 0 ? `المقارنة (${pinned.length})` : 'أحسن الخيارات الآن'}
              </h2>
              {pinned.length > 0 && (
                <button
                  onClick={() => setPinned([])}
                  className="text-[13px] underline"
                  style={{ color: SLATE }}
                >
                  إلغاء الكل
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {stripListings.map((l, i) => {
                const g = grouped.find(g => g.make === l.make_slug && g.model === l.model_slug)
                const color = g?.color ?? CORAL
                return (
                  <div key={l.id} className="relative" style={{ borderInlineStart: `4px solid ${color}`, paddingInlineStart: 8 }}>
                    <ListingCard listing={l} lang="ar" index={i} />
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

// ── Year picker (compact) ────────────────────────────────────────────────────
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
          padding: '6px 12px',
          fontSize: 13,
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

// ── Custom model adder (very lightweight — text input that parses "make model") ──
function CustomBundleAdder ({
  onAdd,
  disabled,
  inline,
}: {
  onAdd: (m: ModelKey) => void
  disabled: boolean
  inline?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={inline ? 'text-[13px] font-semibold' : 'flex-shrink-0 text-[14px] font-bold'}
        style={{
          background: inline ? 'transparent' : '#FFFFFF',
          color: inline ? CORAL : NAVY,
          border: inline ? 'none' : `1px dashed ${SLATE_200}`,
          borderRadius: inline ? 0 : 16,
          padding: inline ? '0' : '12px 20px',
          textDecoration: inline ? 'underline' : 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {inline ? '+ أضف موديل' : 'مخصص'}
      </button>
    )
  }

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        const m = make.trim().toLowerCase()
        const md = model.trim().toLowerCase()
        if (!m || !md) return
        onAdd({ make: m, model: md })
        setMake(''); setModel(''); setOpen(false)
      }}
      className="inline-flex items-center gap-1.5"
      style={{
        background: '#FFFFFF',
        border: `1px solid ${SLATE_200}`,
        borderRadius: 16,
        padding: '6px 10px',
      }}
    >
      <input
        value={make}
        onChange={e => setMake(e.target.value)}
        placeholder="الماركة"
        dir="auto"
        style={{ width: 90, fontSize: 13, color: NAVY, outline: 'none', background: 'transparent' }}
      />
      <span style={{ color: SLATE }}>/</span>
      <input
        value={model}
        onChange={e => setModel(e.target.value)}
        placeholder="الموديل"
        dir="auto"
        style={{ width: 110, fontSize: 13, color: NAVY, outline: 'none', background: 'transparent' }}
      />
      <button type="submit" className="text-[12px] font-bold" style={{ color: CORAL }}>
        إضافة
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-[12px]" style={{ color: SLATE }}>
        إلغاء
      </button>
    </form>
  )
}

// ── Empty chart state ────────────────────────────────────────────────────────
function EmptyChartState ({ message }: { message: string }) {
  return (
    <div
      className="flex items-center justify-center text-center"
      style={{ height: 320, color: SLATE, fontSize: 14 }}
    >
      {message}
    </div>
  )
}

// ── Chart component (memoised) ───────────────────────────────────────────────
type ChartGroup = {
  color: string
  label: string
  data: { x: number; y: number; id: string; listing: Listing }[]
  lines: { x: number; y: number }[] | null
}

const HuntChart = function HuntChart ({
  groups, xMin, xMax, yMin, yMax, hoverId, pinned, onHover, onClick,
}: {
  groups: ChartGroup[]
  xMin: number; xMax: number; yMin: number; yMax: number
  hoverId: string | null
  pinned: string[]
  onHover: (id: string | null) => void
  onClick: (id: string) => void
}) {
  const anyHover = hoverId !== null
  const dotShape = useCallback((props: any) => {
    const { cx, cy, payload } = props
    if (cx == null || cy == null || !payload) return <g />
    const id = payload.id as string
    const isHover  = hoverId === id
    const isPinned = pinned.includes(id)
    const r = isHover ? 14 : 8
    const fillOpacity =
      anyHover ? (isHover ? 1 : 0.25) : 1
    return (
      <g
        style={{ cursor: 'pointer', transition: 'r 0.2s' }}
        onMouseEnter={() => onHover(id)}
        onMouseLeave={() => onHover(null)}
        onClick={() => onClick(id)}
      >
        <circle
          cx={cx} cy={cy} r={r}
          fill={props.fill}
          fillOpacity={fillOpacity}
          stroke={isPinned ? CORAL : 'rgba(15,23,42,0.10)'}
          strokeWidth={isPinned ? 3 : 1}
        />
      </g>
    )
  }, [hoverId, pinned, anyHover, onHover, onClick])

  return (
    <div style={{ width: '100%', height: 500 }} className="md:h-[500px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart margin={{ top: 16, right: 16, bottom: 32, left: 16 }}>
          <CartesianGrid stroke={SLATE_100} strokeDasharray="0" />
          <XAxis
            type="number" dataKey="x"
            domain={[xMin, xMax]}
            tickFormatter={v => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
            tick={{ fill: SLATE, fontSize: 11 }}
            stroke={SLATE_200}
          />
          <YAxis
            type="number" dataKey="y"
            domain={[yMin, yMax]}
            tickFormatter={v => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
            tick={{ fill: SLATE, fontSize: 11 }}
            stroke={SLATE_200}
          />
          <Tooltip
            cursor={false}
            content={<ChartTooltip />}
            wrapperStyle={{ outline: 'none' }}
          />
          {/* Regression line per model (drawn under the scatter points). */}
          {groups.map((g, i) =>
            g.lines ? (
              <Line
                key={`reg-${i}`}
                data={g.lines}
                type="linear"
                dataKey="y"
                xAxisId={0}
                yAxisId={0}
                stroke={g.color}
                strokeWidth={1.5}
                strokeDasharray="6 4"
                strokeOpacity={0.55}
                dot={false}
                isAnimationActive={false}
              />
            ) : null
          )}
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
  )
}

// Custom Tooltip rendered by Recharts. Receives payload via Recharts.
function ChartTooltip ({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null
  const datum = payload[0]?.payload
  const l: Listing | undefined = datum?.listing
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
