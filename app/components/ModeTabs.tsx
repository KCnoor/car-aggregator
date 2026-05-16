'use client'

import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'

// Four mode tabs. Search lives as the 5th element next to this component
// inside StickyHeader — see StickyHeader.tsx for the row layout.
//
// Icons are the four extracted PNGs in public/modes/ (see
// scripts/extract-brand-assets.js). Do NOT redraw them as SVG — the PNGs
// are the canonical artwork.

type Mode = {
  href: string
  titleAr: string
  subtitleAr: string
  icon: string   // PNG path under public/
}

const MODES: Mode[] = [
  {
    href: '/browse',
    titleAr: 'كل السوق',
    subtitleAr: 'تصفّح كل الإعلانات',
    icon: '/modes/all-market.png',
  },
  {
    href: '/match',
    titleAr: 'الخطّابة',
    subtitleAr: 'ترشيح ذكي',
    icon: '/modes/matchmaker.png',
  },
  {
    href: '/analyze',
    titleAr: 'الصياد',
    subtitleAr: 'تعرف وش تبي بس تدور اللقطة',
    icon: '/modes/hunter.png',
  },
  {
    href: '/pulse',
    titleAr: 'نبض السوق',
    subtitleAr: 'الأخبار والاتجاهات',
    icon: '/modes/pulse.png',
  },
]

export default function ModeTabs ({ className = '' }: { className?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const active = MODES.find(m => pathname === m.href || pathname.startsWith(m.href + '/'))?.href ?? null

  function go (href: string) {
    if (href === active) return
    router.push(href)
  }

  return (
    <div
      dir="rtl"
      role="tablist"
      aria-label="أوضاع سيارة"
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
            aria-pressed={isActive}
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
              minHeight: 88,
            }}
          >
            <div className="h-full w-full flex flex-col items-center justify-center px-2 py-2 gap-1">
              <div
                className="rounded-xl overflow-hidden inline-flex items-center justify-center shrink-0"
                style={{
                  // Faintly tinted backplate so PNG icons sit on a chip rather
                  // than floating loose. Active card hides the chip (icon
                  // sits on coral directly).
                  background: isActive ? 'transparent' : '#F8FAFC',
                  width: 48,
                  height: 48,
                }}
              >
                <Image
                  src={m.icon}
                  alt=""
                  width={48}
                  height={48}
                  style={{ width: 40, height: 40, objectFit: 'contain' }}
                  priority={isActive}
                />
              </div>
              <span
                className="font-extrabold leading-tight"
                style={{
                  color: isActive ? '#FFFFFF' : 'var(--text-primary)',
                  fontSize: 14,
                  fontWeight: 800,
                }}
              >
                {m.titleAr}
              </span>
              <span
                className="leading-tight hidden md:block text-center px-1"
                style={{
                  color: isActive ? 'rgba(255,255,255,0.85)' : 'var(--text-secondary)',
                  fontSize: 11,
                  fontWeight: 400,
                }}
              >
                {m.subtitleAr}
              </span>
            </div>
          </motion.button>
        )
      })}
    </div>
  )
}
