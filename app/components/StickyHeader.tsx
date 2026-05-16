'use client'

import { useEffect, useState } from 'react'
import ModeTabs from './ModeTabs'
import { useLang } from './LangContext'

// Sticky persistent header. Two horizontal "cuts":
//   CUT 1 — Brand strip (64px). Logo right (RTL), tagline next to logo,
//           live counter card + lang toggle on the left.
//   CUT 2 — Mode tabs strip (88px). Four cards centered with 32px page
//           padding.
//
// CUT 3 (the search bar) lives inside the Browse page's hero — it's
// Browse-specific, not global, so it's not part of this component.
//
// Background: the sky gradient (#E0F2FE → #DBEAFE) flows across both cuts
// uninterrupted. Below the header, the (modes) content area fades into
// #F8FAFC; that fade is rendered by ModesShell so it can sit beneath the
// AnimatePresence transition.

const CORAL = 'var(--accent-primary)'
const CORAL_HOVER = 'var(--accent-primary-hover)'
const SLATE_800 = 'var(--text-primary)'
const SLATE_500 = 'var(--text-secondary)'
const SUCCESS  = 'var(--success)'
const GOLD = '#D8A66C'

function LogoWordmark () {
  return (
    <span className="inline-flex items-baseline gap-1 leading-none">
      <span
        className="font-bold tracking-wide"
        style={{
          fontFamily: 'var(--font-reem-kufi), var(--font-tajawal), sans-serif',
          color: SLATE_800,
          fontSize: 32,
          lineHeight: 1,
        }}
      >
        سيارة
      </span>
      <span
        className="font-bold tracking-tight"
        style={{
          fontFamily: 'var(--font-geist), Geist, sans-serif',
          color: GOLD,
          fontSize: 22,
          letterSpacing: '0.04em',
          lineHeight: 1,
        }}
      >
        AI
      </span>
    </span>
  )
}

// Animated coral pulse dot + expanding glow ring.
function PulseDot () {
  return (
    <span aria-hidden className="relative inline-flex items-center justify-center w-3 h-3 shrink-0">
      <span
        className="absolute inset-0 rounded-full pulse-ring"
        style={{ background: CORAL, opacity: 0.55 }}
      />
      <span
        className="relative w-2 h-2 rounded-full pulse-core"
        style={{ background: CORAL, boxShadow: '0 0 8px rgba(255,107,74,0.65)' }}
      />
    </span>
  )
}

function LiveCounter ({ totalCount, newDealsCount }: { totalCount: number; newDealsCount: number }) {
  const [display, setDisplay] = useState(totalCount)
  useEffect(() => { setDisplay(totalCount) }, [totalCount])
  useEffect(() => {
    let cancelled = false
    let active: ReturnType<typeof setTimeout> | null = null
    let rest:   ReturnType<typeof setTimeout> | null = null
    const startCycle = () => {
      if (cancelled) return
      const startedAt = Date.now()
      const tick = () => {
        if (cancelled) return
        if (Date.now() - startedAt >= 30_000) {
          setDisplay(totalCount)
          rest = setTimeout(startCycle, 60_000); return
        }
        setDisplay(prev => {
          const delta = prev - totalCount
          const step = delta >=  3 ? -1
                     : delta <= -3 ? +1
                     : (Math.random() < 0.5 ? -1 : +1)
          return prev + step
        })
        active = setTimeout(tick, 8000 + Math.random() * 2000)
      }
      active = setTimeout(tick, 8000 + Math.random() * 2000)
    }
    rest = setTimeout(startCycle, 60_000)
    return () => { cancelled = true; if (active) clearTimeout(active); if (rest) clearTimeout(rest) }
  }, [totalCount])

  return (
    <div
      className="hidden sm:flex items-center gap-3 px-3"
      style={{
        width: 220,
        height: 56,
        background: 'var(--bg-card)',
        borderRadius: 16,
        boxShadow: 'var(--shadow-soft)',
        borderRight: `4px solid ${CORAL}`,
      }}
      role="status"
      aria-label="عدد الإعلانات النشطة"
    >
      <PulseDot />
      <div className="flex flex-col leading-none min-w-0">
        <span
          className="tabular-nums font-extrabold"
          style={{ color: SLATE_800, fontSize: 24, fontWeight: 800 }}
        >
          {display.toLocaleString()}
        </span>
        <span style={{ color: SLATE_500, fontSize: 12 }}>إعلان نشط الآن</span>
      </div>
      {newDealsCount > 0 && (
        <span
          className="ms-auto inline-flex items-center gap-0.5 tabular-nums font-bold"
          style={{ color: SUCCESS, fontSize: 10 }}
        >
          <span aria-hidden>↑</span>
          <span>+{newDealsCount}</span>
        </span>
      )}
    </div>
  )
}

// Compact mobile version of the counter (no big white card).
function MobileLiveCounter ({ totalCount, newDealsCount }: { totalCount: number; newDealsCount: number }) {
  return (
    <span
      className="sm:hidden inline-flex items-center gap-1.5 rounded-full px-2 py-1"
      style={{
        background: 'rgba(255,255,255,0.85)',
        boxShadow: 'var(--shadow-soft)',
      }}
    >
      <PulseDot />
      <span
        className="tabular-nums font-extrabold"
        style={{ color: SLATE_800, fontSize: 12 }}
      >
        {totalCount.toLocaleString()}
      </span>
      {newDealsCount > 0 && (
        <span className="tabular-nums font-bold" style={{ color: SUCCESS, fontSize: 9 }}>
          +{newDealsCount}
        </span>
      )}
    </span>
  )
}

export default function StickyHeader ({
  totalCount,
  newDealsCount,
}: {
  totalCount: number
  newDealsCount: number
}) {
  const { lang, setLang } = useLang()

  return (
    <header
      dir="rtl"
      className="sticky top-0 z-40 w-full"
      style={{
        background: 'var(--bg-hero)',
        borderBottom: '1px solid var(--hairline)',
      }}
    >
      {/* CSS var for downstream sticky elements (filter bar) to know the
          total header height. Two cuts → 64 + 88 = 152px desktop, 64 + 88
          mobile (tabs same height, brand strip same height). */}
      <style>{`
        :root { --hdr-h: 152px; }
      `}</style>

      {/* ── CUT 1 — Brand strip ──────────────────────────────────────── */}
      <div
        className="flex items-center"
        style={{ height: 64, paddingInlineEnd: 32, paddingInlineStart: 16 }}
      >
        <div className="max-w-screen-xl w-full mx-auto flex items-center gap-4">
          {/* Right (RTL first): logo + tagline */}
          <a href="/browse" className="shrink-0 select-none" aria-label="سيارة AI">
            <LogoWordmark />
          </a>
          <span
            className="hidden sm:inline-block truncate"
            style={{ color: '#475569', fontSize: 14, fontStyle: 'italic' }}
          >
            مستشارك الذكي للسيارات في السعودية
          </span>

          {/* Left: live counter + lang toggle */}
          <div className="ms-auto flex items-center gap-3 shrink-0">
            <LiveCounter totalCount={totalCount} newDealsCount={newDealsCount} />
            <MobileLiveCounter totalCount={totalCount} newDealsCount={newDealsCount} />
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="rounded-full h-8 px-3 text-xs font-bold transition-colors"
              style={{
                background: 'var(--bg-card)',
                color: SLATE_800,
                border: '1px solid var(--hairline)',
                boxShadow: 'var(--shadow-soft)',
              }}
              aria-label="Toggle language"
              onMouseEnter={e => (e.currentTarget.style.background = '#F1F5F9')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-card)')}
            >
              {lang === 'ar' ? 'EN' : 'ع'}
            </button>
          </div>
        </div>
      </div>

      {/* ── CUT 2 — Mode tabs strip ──────────────────────────────────── */}
      <div
        className="flex items-center"
        style={{ height: 88, paddingInline: 32 }}
      >
        <div className="max-w-screen-xl w-full mx-auto">
          <ModeTabs />
        </div>
      </div>

      {/* Suppress the unused-var warning for CORAL_HOVER (kept for future
          interaction polish — not stripping it yet). */}
      <span hidden style={{ background: CORAL_HOVER }} aria-hidden />
    </header>
  )
}
