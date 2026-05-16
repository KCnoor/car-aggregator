'use client'

import { useEffect, useState } from 'react'
import ModeTabs from './ModeTabs'
import { useLang } from './LangContext'

// One sticky header for every CarSa mode. RTL layout:
//   right  → logo (سيارة AI wordmark)
//   middle → mode tabs (4 across desktop, horizontal-scroll mobile)
//   left   → listings counter pill + language toggle
//
// Solid #0A1628 background, no transparency. Height 80px desktop / 64px
// mobile. Stays sticky on scroll and across mode navigation.

const AMBER = '#D8A66C'

function SiyaraWordmark () {
  return (
    <span className="inline-flex items-baseline gap-1 leading-none">
      <span
        className="font-bold text-white tracking-wide text-xl sm:text-2xl"
        style={{ fontFamily: 'var(--font-reem-kufi), var(--font-tajawal), sans-serif' }}
      >
        سيارة
      </span>
      <span
        className="font-bold tracking-tight text-base sm:text-lg"
        style={{
          fontFamily: 'var(--font-geist), Geist, sans-serif',
          color: AMBER,
          letterSpacing: '0.04em',
        }}
      >
        AI
      </span>
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

  // Live-counter fluctuation around the real total. Cycle: 60s rest →
  // 30s active stepping ±1, never more than ±3 from truth.
  const [display, setDisplay] = useState(totalCount)
  useEffect(() => { setDisplay(totalCount) }, [totalCount])
  useEffect(() => {
    let cancelled = false
    let active: ReturnType<typeof setTimeout> | null = null
    let rest:   ReturnType<typeof setTimeout> | null = null
    const startCycle = () => {
      if (cancelled) return
      const startedAt = Date.now()
      const cycleMs = 30_000
      const tick = () => {
        if (cancelled) return
        if (Date.now() - startedAt >= cycleMs) {
          setDisplay(totalCount)
          rest = setTimeout(startCycle, 60_000)
          return
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
    <header
      dir="rtl"
      className="sticky top-0 z-40 w-full"
      style={{
        background: '#0A1628',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div
        className="max-w-screen-xl mx-auto px-3 sm:px-5 flex items-center gap-3 sm:gap-5"
        style={{ height: 'var(--hdr-h, 64px)' }}
      >
        <style>{`
          :root { --hdr-h: 64px; }
          @media (min-width: 640px) { :root { --hdr-h: 80px; } }
        `}</style>

        {/* Right (RTL first): logo */}
        <a href="/browse" className="shrink-0 select-none" aria-label="سيارة AI">
          <SiyaraWordmark />
        </a>

        {/* Middle: mode tabs — flex to fill available space */}
        <div className="flex-1 min-w-0">
          <ModeTabs />
        </div>

        {/* Left: counter pill + lang toggle */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold tabular-nums"
            style={{
              background: 'rgba(216,166,108,0.10)',
              border: '1px solid rgba(216,166,108,0.28)',
              color: AMBER,
            }}
            aria-label="عدد الإعلانات النشطة"
          >
            <span>{display.toLocaleString()} {lang === 'ar' ? 'إعلان نشط' : 'active'}</span>
            {newDealsCount > 0 && (
              <span className="opacity-80" style={{ color: AMBER }}>
                ↑ {newDealsCount.toLocaleString()} {lang === 'ar' ? 'جديد اليوم' : 'new'}
              </span>
            )}
          </span>
          <button
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            className="rounded-full h-8 px-3 text-xs font-semibold transition-colors border"
            style={{
              background: 'rgba(255,255,255,0.06)',
              borderColor: 'rgba(255,255,255,0.18)',
              color: 'white',
            }}
            aria-label="Toggle language"
          >
            {lang === 'ar' ? 'EN' : 'AR'}
          </button>
        </div>

        {/* Mobile counter pill + toggle (compact) */}
        <div className="flex sm:hidden items-center gap-1.5 shrink-0">
          <span
            className="inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold tabular-nums"
            style={{
              background: 'rgba(216,166,108,0.10)',
              border: '1px solid rgba(216,166,108,0.28)',
              color: AMBER,
            }}
          >
            {display.toLocaleString()}
          </span>
          <button
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            className="rounded-full h-7 px-2 text-[10px] font-bold border"
            style={{
              background: 'rgba(255,255,255,0.06)',
              borderColor: 'rgba(255,255,255,0.18)',
              color: 'white',
            }}
          >
            {lang === 'ar' ? 'EN' : 'AR'}
          </button>
        </div>
      </div>
    </header>
  )
}
