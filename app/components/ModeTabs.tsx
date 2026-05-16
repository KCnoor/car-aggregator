'use client'

import { usePathname, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'

// Top-level navigation across the four CarSa modes. Each mode is a route
// under /(modes)/. Active mode is detected from the URL via usePathname.
// Click → router.push triggers a cross-fade in the (modes) layout.

type Mode = {
  href: string
  nameAr: string
  taglineAr: string
  emoji: string      // v0 character placeholder
  accent: string     // accent color per the design brief
  bgGradient: string // active card gradient
}

const MODES: Mode[] = [
  {
    href: '/browse',
    nameAr: 'كل السوق',
    taglineAr: 'تصفّح كل الإعلانات',
    emoji: '🗺️',
    accent: '#1E3A8A',                                              // deep blue
    bgGradient: 'linear-gradient(135deg, #1E3A8A 0%, #2D4A9E 100%)',
  },
  {
    href: '/match',
    nameAr: 'الخطّابة',
    taglineAr: 'تنصحك بالسيارة المناسبة',
    emoji: '☕',
    accent: '#B8336A',                                              // warm rose/gold
    bgGradient: 'linear-gradient(135deg, #B8336A 0%, #D4A574 100%)',
  },
  {
    href: '/analyze',
    nameAr: 'المحلّل',
    taglineAr: 'تحليل عميق للسوق',
    emoji: '📊',
    accent: '#3B82B5',                                              // chrome blue
    bgGradient: 'linear-gradient(135deg, #3B82B5 0%, #5E9EC9 100%)',
  },
  {
    href: '/pulse',
    nameAr: 'نبض السوق',
    taglineAr: 'الأخبار والاتجاهات',
    emoji: '📡',
    accent: '#4A8A8A',                                              // muted teal
    bgGradient: 'linear-gradient(135deg, #4A8A8A 0%, #6BA8A8 100%)',
  },
]

export default function ModeTabs () {
  const pathname = usePathname()
  const router = useRouter()

  // Match longest-prefix so /listings/[id] does not light up any tab,
  // but /browse, /browse/something, /match, etc. all resolve correctly.
  const active = MODES.find(m => pathname === m.href || pathname.startsWith(m.href + '/'))?.href ?? null

  function go (href: string) {
    if (href === active) return
    router.push(href)
  }

  return (
    <nav
      dir="rtl"
      className="w-full border-b"
      style={{ background: '#0A1628', borderColor: 'rgba(255,255,255,0.08)' }}
      aria-label="أوضاع سيارة"
    >
      <div className="max-w-screen-xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
        {/* Mobile: horizontal scroll. Desktop: 4-up grid. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {MODES.map(m => {
            const isActive = active === m.href
            return (
              <motion.button
                key={m.href}
                onClick={() => go(m.href)}
                whileHover={{ y: isActive ? 0 : -2 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'tween', duration: 0.15 }}
                className="relative text-right rounded-2xl px-4 py-3.5 sm:py-4 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                style={{
                  background: isActive ? m.bgGradient : 'rgba(255,255,255,0.04)',
                  border: isActive
                    ? `1px solid ${m.accent}`
                    : '1px solid rgba(255,255,255,0.08)',
                  boxShadow: isActive
                    ? `0 10px 24px -10px ${m.accent}80, inset 0 1px 0 rgba(255,255,255,0.12)`
                    : 'none',
                  opacity: isActive ? 1 : 0.78,
                }}
                aria-pressed={isActive}
                aria-current={isActive ? 'page' : undefined}
              >
                {/* you-are-here indicator */}
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute top-2 right-2 inline-block w-1.5 h-1.5 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.85)' }}
                  />
                )}

                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="text-3xl sm:text-4xl leading-none shrink-0 select-none"
                    style={{
                      filter: isActive ? 'none' : 'grayscale(0.35)',
                      transform: isActive ? 'scale(1)' : 'scale(0.92)',
                      transition: 'transform 0.2s, filter 0.2s',
                    }}
                  >
                    {m.emoji}
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span
                      className="font-bold text-sm sm:text-base leading-tight truncate"
                      style={{ color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.92)' }}
                    >
                      {m.nameAr}
                    </span>
                    <span
                      className="text-[11px] sm:text-xs mt-1 leading-snug line-clamp-2"
                      style={{ color: isActive ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.55)' }}
                    >
                      {m.taglineAr}
                    </span>
                  </div>
                </div>
              </motion.button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
