'use client'

import { usePathname, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Globe2, Coffee, TrendingUp, Activity } from 'lucide-react'
import type { ReactNode } from 'react'

// Mode tabs — Cut 2 of the sticky header.
// Locked dimensions: 240×72 desktop, 200×64 mobile. Inactive tabs are white
// cards with soft blue shadow; active tab is coral with a coral glow. Each
// tab has an accent-color dot in the bottom-left corner when inactive so
// the four modes stay visually distinct at a glance.

const SLATE_800 = 'var(--text-primary)'
const SLATE_500 = 'var(--text-secondary)'

type Mode = {
  href: string
  titleAr: string
  subtitleAr: string
  iconNode: (color: string) => ReactNode
  accent: string  // accent dot when inactive
}

const ICON_SIZE = 24

const MODES: Mode[] = [
  {
    href: '/browse',
    titleAr: 'كل السوق',
    subtitleAr: 'تصفّح كل الإعلانات',
    iconNode: (c) => <Globe2 size={ICON_SIZE} color={c} strokeWidth={1.7} />,
    accent: '#3B82F6',
  },
  {
    href: '/match',
    titleAr: 'الخطّابة',
    subtitleAr: 'ترشيح ذكي',
    iconNode: (c) => <Coffee size={ICON_SIZE} color={c} strokeWidth={1.7} />,
    accent: '#EC4899',
  },
  {
    href: '/analyze',
    titleAr: 'المحلّل',
    subtitleAr: 'تحليل عميق',
    iconNode: (c) => <TrendingUp size={ICON_SIZE} color={c} strokeWidth={1.7} />,
    accent: '#10B981',
  },
  {
    href: '/pulse',
    titleAr: 'نبض السوق',
    subtitleAr: 'الأخبار والاتجاهات',
    iconNode: (c) => <Activity size={ICON_SIZE} color={c} strokeWidth={1.7} />,
    accent: '#8B5CF6',
  },
]

export default function ModeTabs () {
  const pathname = usePathname()
  const router = useRouter()
  const active = MODES.find(m => pathname === m.href || pathname.startsWith(m.href + '/'))?.href ?? null

  function go (href: string) {
    if (href === active) return
    router.push(href)
  }

  return (
    <nav
      dir="rtl"
      aria-label="أوضاع سيارة"
      className="flex items-center gap-3 sm:justify-center overflow-x-auto no-scrollbar snap-x snap-mandatory"
    >
      {MODES.map(m => {
        const isActive = active === m.href
        const iconColor = isActive ? '#FFFFFF' : m.accent

        return (
          <motion.button
            key={m.href}
            onClick={() => go(m.href)}
            aria-pressed={isActive}
            aria-current={isActive ? 'page' : undefined}
            // Restraint: hover lift only when there's something to gain;
            // active card stays put so it doesn't outshout the others.
            whileHover={isActive ? undefined : { y: -1 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: 'tween', duration: 0.15, ease: 'easeOut' }}
            className="relative shrink-0 snap-start text-center rounded-[20px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B4A]/40 transition-shadow"
            style={{
              width: 'var(--tab-w, 200px)',
              height: 'var(--tab-h, 64px)',
              // Active background is coral at 90% (CORAL_SOFT) to soften the
              // wall-of-color feel; shadow is the softer var(--shadow-soft)
              // not the heavier coral-glow var(--shadow-active).
              background: isActive ? 'rgba(255,107,74,0.90)' : 'var(--bg-card)',
              border: '1px solid',
              borderColor: isActive ? 'transparent' : 'var(--hairline)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            <style>{`
              :root { --tab-w: 200px; --tab-h: 64px; }
              @media (min-width: 768px) { :root { --tab-w: 240px; --tab-h: 72px; } }
            `}</style>

            <div className="h-full flex flex-col items-center justify-center gap-0.5 px-3">
              <motion.span
                className="inline-flex items-center justify-center leading-none"
                whileHover={isActive ? undefined : { y: -2 }}
                transition={{ type: 'spring', stiffness: 300, damping: 12 }}
              >
                {m.iconNode(iconColor)}
              </motion.span>
              <span
                className="font-extrabold leading-tight truncate w-full"
                style={{
                  color: isActive ? '#FFFFFF' : SLATE_800,
                  fontSize: 16,
                  fontWeight: 800,
                }}
              >
                {m.titleAr}
              </span>
              <span
                className="hidden md:block leading-tight truncate w-full"
                style={{
                  color: isActive ? 'rgba(255,255,255,0.90)' : SLATE_500,
                  fontSize: 12,
                  fontWeight: 400,
                }}
              >
                {m.subtitleAr}
              </span>
            </div>

            {/* Accent dot — visible only on inactive cards so the four
                modes stay distinguishable at a glance. */}
            {!isActive && (
              <span
                aria-hidden
                className="absolute"
                style={{
                  bottom: 8,
                  insetInlineStart: 8,
                  width: 6,
                  height: 6,
                  borderRadius: 9999,
                  background: m.accent,
                }}
              />
            )}
          </motion.button>
        )
      })}
    </nav>
  )
}
