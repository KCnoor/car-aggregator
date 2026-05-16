'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import ModeTabs from './ModeTabs'
import SearchBox from './SearchBox'
import { useLang } from './LangContext'
import { Logo } from './Brand'

// Sticky persistent header.
//
//   CUT 1 — Brand strip:   logo right (RTL), live counter + lang toggle left.
//   CUT 2 — Mode strip:    four mode tabs + the search input as the 5th
//                          element. Desktop is a single horizontal row,
//                          mobile stacks tabs (2×2) above search (full-width).
//
// Cut 3 (the in-hero search bar that used to live on Browse) is gone —
// the search now lives globally inside the header.

const CORAL    = 'var(--accent-primary)'
const SUCCESS  = 'var(--success)'
const SLATE_500 = 'var(--text-secondary)'

// Animated coral pulse dot (CSS-only — keyframes live in globals.css).
function PulseDot () {
  return (
    <span aria-hidden className="relative inline-flex items-center justify-center w-3 h-3 shrink-0">
      <span className="absolute inset-0 rounded-full pulse-ring" style={{ background: CORAL, opacity: 0.55 }} />
      <span className="relative w-2 h-2 rounded-full pulse-core" style={{ background: CORAL, boxShadow: '0 0 8px rgba(255,107,74,0.65)' }} />
    </span>
  )
}

// LiveCounter — the soul of the header. White rounded card with a coral
// left-border, the pulse dot, the active count, and a green '+N جديد
// اليوم' pill that filters /browse to the last 24h on click.
function LiveCounter ({
  totalCount, newDealsCount, onNewClick, langLabel = 'إعلان نشط الآن',
}: {
  totalCount: number
  newDealsCount: number
  onNewClick: () => void
  langLabel?: string
}) {
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

  const newDisplay = newDealsCount >= 1000 ? '+1000' : `+${newDealsCount}`

  return (
    <div
      className="hidden sm:flex items-center gap-3 px-3"
      style={{
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
          style={{ color: 'var(--text-primary)', fontSize: 22, fontWeight: 800 }}
        >
          {display.toLocaleString()}
        </span>
        <span style={{ color: SLATE_500, fontSize: 11 }}>{langLabel}</span>
      </div>

      {newDealsCount > 0 && (
        <>
          {/* Separator hairline */}
          <span aria-hidden style={{ width: 1, height: 28, background: 'var(--hairline)' }} />

          <button
            type="button"
            onClick={onNewClick}
            className="inline-flex items-center gap-1 tabular-nums transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            style={{
              background: SUCCESS,
              color: '#FFFFFF',
              fontSize: 13,
              fontWeight: 800,
              padding: '6px 10px',
              borderRadius: 999,
              lineHeight: 1,
            }}
            aria-label="إظهار آخر 24 ساعة فقط"
            title="إظهار آخر 24 ساعة فقط"
          >
            <span aria-hidden style={{ fontSize: 12 }}>↗</span>
            <span>{newDisplay}</span>
            <span style={{ fontWeight: 700, opacity: 0.95 }}>جديد اليوم</span>
          </button>
        </>
      )}
    </div>
  )
}

// Compact mobile counter — same pulse + total + optional green pill.
function MobileLiveCounter ({
  totalCount, newDealsCount, onNewClick,
}: {
  totalCount: number; newDealsCount: number; onNewClick: () => void
}) {
  return (
    <div className="sm:hidden flex items-center gap-1.5">
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-1"
        style={{ background: 'rgba(255,255,255,0.85)', boxShadow: 'var(--shadow-soft)' }}
      >
        <PulseDot />
        <span className="tabular-nums font-extrabold" style={{ color: 'var(--text-primary)', fontSize: 12 }}>
          {totalCount.toLocaleString()}
        </span>
      </span>
      {newDealsCount > 0 && (
        <button
          type="button"
          onClick={onNewClick}
          className="inline-flex items-center gap-0.5 tabular-nums rounded-full"
          style={{
            background: SUCCESS, color: '#FFFFFF',
            fontSize: 10, fontWeight: 800,
            padding: '4px 7px', lineHeight: 1,
          }}
          aria-label="إظهار آخر 24 ساعة فقط"
        >
          <span aria-hidden>↗</span>
          {newDealsCount >= 1000 ? '+1000' : `+${newDealsCount}`}
        </button>
      )}
    </div>
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
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function gotoLast24h () {
    // Navigate to /browse with a flag the page consumes to flip
    // newDealsOnly on. Reuses the existing in-page filter.
    if (pathname === '/browse') router.replace('/browse?new24h=1')
    else                        router.push('/browse?new24h=1')
  }

  const initialQuery = params.get('q') ?? ''

  return (
    <header
      dir="rtl"
      className="sticky top-0 z-40 w-full"
      style={{
        background: 'var(--bg-hero)',
        borderBottom: '1px solid var(--hairline)',
      }}
    >
      <style>{`
        /* Filter bar inside Browse sticks below this header — adjust if
           the cut heights change. Desktop: brand 80 + tabs 112 = 192.
           Mobile: brand 64 + tabs/search stack ≈ 220. We pick the
           larger to be safe; an overshoot of ~20px is harmless. */
        :root { --hdr-h: 220px; }
        @media (min-width: 768px) { :root { --hdr-h: 192px; } }
      `}</style>

      {/* ── CUT 1 — Brand strip ────────────────────────────────────────
          RTL paddings — 32px from the right (logo edge) on desktop. */}
      <div
        className="flex items-center"
        style={{ minHeight: 64, paddingInlineEnd: 32, paddingInlineStart: 16 }}
      >
        <div className="max-w-screen-xl w-full mx-auto flex items-center gap-3">
          <a
            href="/browse"
            className="shrink-0 inline-flex items-center"
            aria-label="سيارة AI"
            style={{ maxWidth: 240 }}
          >
            <span className="hidden sm:inline-block"><Logo size="lg" priority /></span>
            <span className="inline-block sm:hidden"><Logo size="sm" priority /></span>
          </a>

          <div className="ms-auto flex items-center gap-2 sm:gap-3 shrink-0">
            <LiveCounter
              totalCount={totalCount}
              newDealsCount={newDealsCount}
              onNewClick={gotoLast24h}
              langLabel={lang === 'ar' ? 'إعلان نشط الآن' : 'active now'}
            />
            <MobileLiveCounter
              totalCount={totalCount}
              newDealsCount={newDealsCount}
              onNewClick={gotoLast24h}
            />
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="rounded-full h-8 px-3 text-xs font-bold transition-colors"
              style={{
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                border: '1px solid var(--hairline)',
                boxShadow: 'var(--shadow-soft)',
              }}
              aria-label="Toggle language"
            >
              {lang === 'ar' ? 'EN' : 'ع'}
            </button>
          </div>
        </div>
      </div>

      {/* ── CUT 2 — Mode strip: 4 tabs + search as 5th element ──────────
          Desktop: single flex row — ModeTabs (4 tabs, equal width) takes
                   ~70%, SearchBox takes ~30%.
          Mobile:  stacked — ModeTabs renders as a 2×2 grid (its internal
                   default), SearchBox sits as a full-width row below. */}
      <div className="px-4 pb-3 md:pb-4">
        <div className="max-w-screen-xl mx-auto flex flex-col md:flex-row gap-2 md:gap-3 md:items-stretch">
          <ModeTabs className="md:flex-[7]" />
          <div className="md:flex-[3] md:min-w-0" style={{ minHeight: 56 }}>
            <SearchBox className="h-full block" initialValue={initialQuery} />
          </div>
        </div>
      </div>
    </header>
  )
}
