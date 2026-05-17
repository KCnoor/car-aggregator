'use client'

import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useLang } from './LangContext'

// Four mode tabs. Search lives as the 5th element next to this component
// inside StickyHeader — see StickyHeader.tsx for the row layout.
//
// Icons are the four extracted PNGs in public/modes/ (see
// scripts/extract-brand-assets.js). Do NOT redraw them as SVG — the PNGs
// are the canonical artwork.

type Mode = {
  href: string
  titleAr: string
  titleEn: string
  subtitleAr: string
  subtitleEn: string
  icon: string   // PNG path under public/
}

const MODES: Mode[] = [
  {
    href: '/browse',
    titleAr: 'كل السوق',
    titleEn: 'Browse All',
    subtitleAr: 'تصفّح كل الإعلانات',
    subtitleEn: 'Browse all listings',
    icon: '/modes/all-market.png',
  },
  {
    href: '/match',
    titleAr: 'الخطّابة',
    titleEn: 'Matchmaker',
    subtitleAr: 'ترشيح ذكي',
    subtitleEn: 'Smart matching',
    icon: '/modes/matchmaker.png',
  },
  {
    href: '/hunt',
    titleAr: 'الصياد',
    titleEn: 'Hunter',
    subtitleAr: 'تعرف وش تبي بس تدور اللقطة',
    subtitleEn: 'You know what you want — hunt the catch',
    icon: '/modes/hunter.png',
  },
  {
    href: '/pulse',
    titleAr: 'نبض السوق',
    titleEn: 'Market Pulse',
    subtitleAr: 'الأخبار والاتجاهات',
    subtitleEn: 'News and trends',
    icon: '/modes/pulse.png',
  },
]

export default function ModeTabs ({ className = '' }: { className?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const { lang } = useLang()
  // Default to the first tab (كل السوق) when no route matches — handles
  // the brief flash between the / → /browse redirect and the first paint.
  const active =
    MODES.find(m => pathname === m.href || pathname.startsWith(m.href + '/'))?.href
    ?? MODES[0].href

  function go (href: string) {
    if (href === active) return
    router.push(href)
  }

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      role="tablist"
      aria-label={lang === 'ar' ? 'أوضاع سيارة' : 'Siyara modes'}
      className={
        // 2×2 on mobile so all four modes are visible without scrolling.
        // Equal-width row on desktop (parent flex container assigns the width).
        'grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 h-full ' + className
      }
    >
      {MODES.map(m => {
        const isActive = active === m.href
        return (
          <motion.button
            key={m.href}
            role="tab"
            type="button"
            onClick={() => go(m.href)}
            aria-selected={isActive}
            aria-current={isActive ? 'page' : undefined}
            whileHover={isActive ? undefined : { y: -1 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: 'tween', duration: 0.15, ease: 'easeOut' }}
            className="relative rounded-[20px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B4A]/40 transition-shadow"
            style={{
              // Toned-down active state: coral at 90% with the softer shadow.
              background: isActive ? 'rgba(255,107,74,0.90)' : 'var(--bg-card)',
              border: '1px solid',
              borderColor: isActive ? 'transparent' : 'var(--hairline)',
              boxShadow: 'var(--shadow-soft)',
              minHeight: 'var(--tab-h, 64px)',
            }}
          >
            {/* Compact layout: 36px icon on the trailing side (RTL = left
                visually), title + subtitle stack on the leading side.
                Locked dimensions per the May-17 refinement:
                  desktop 72px tall × ~12×16 padding
                  mobile  64px tall × 12×12 padding */}
            <style>{`
              :root { --tab-h: 64px; }
              @media (min-width: 768px) { :root { --tab-h: 72px; } }
            `}</style>
            <div className="h-full w-full flex flex-row-reverse items-center justify-between gap-2.5"
                 style={{ padding: '12px 16px' }}>
              <Image
                src={m.icon}
                alt=""
                width={36}
                height={36}
                priority={isActive}
                style={{
                  width: 36,
                  height: 36,
                  objectFit: 'contain',
                  flexShrink: 0,
                  display: 'block',
                }}
              />
              <div className="flex flex-col items-end min-w-0 flex-1">
                <span
                  className="font-extrabold leading-tight truncate"
                  style={{
                    color: isActive ? '#FFFFFF' : 'var(--text-primary)',
                    fontSize: 16,
                    fontWeight: 800,
                  }}
                >
                  {lang === 'ar' ? m.titleAr : m.titleEn}
                </span>
                <span
                  className="leading-tight hidden md:block truncate w-full text-end"
                  style={{
                    color: isActive ? 'rgba(255,255,255,0.85)' : 'var(--text-secondary)',
                    fontSize: 12,
                    fontWeight: 400,
                    marginTop: 2,
                  }}
                >
                  {lang === 'ar' ? m.subtitleAr : m.subtitleEn}
                </span>
              </div>
            </div>
          </motion.button>
        )
      })}
    </div>
  )
}
