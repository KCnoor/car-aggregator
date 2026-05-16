'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Globe, BarChart3, Activity } from 'lucide-react'
import type { ReactNode } from 'react'

// Mode tabs that live inside StickyHeader. Locked layout:
//   - Desktop: 4 tabs side-by-side, each ~220px wide × 64px tall.
//   - Mobile: horizontal scroll, snap to each tab, each 160px wide.
//   - Active tab: gold border + slight elevation + tiny gold "you-are-here"
//     dot top-right.
//   - Lucide icons for 3 modes; the matchmaker keeps the ☕ emoji to
//     preserve the cultural cue until we ship the real illustration.

const GOLD = '#D8A66C'

type Mode = {
  href: string
  titleAr: string
  subtitleAr: string
  icon: ReactNode
}

function modes (): Mode[] {
  const iconCls = 'w-5 h-5'
  return [
    {
      href: '/browse',
      titleAr: 'كل السوق',
      subtitleAr: 'تصفّح كل الإعلانات',
      icon: <Globe className={iconCls} strokeWidth={1.8} />,
    },
    {
      href: '/match',
      titleAr: 'الخطّابة',
      subtitleAr: 'ترشيح ذكي',
      icon: <span className="text-xl leading-none">☕</span>,
    },
    {
      href: '/analyze',
      titleAr: 'المحلّل',
      subtitleAr: 'تحليل عميق',
      icon: <BarChart3 className={iconCls} strokeWidth={1.8} />,
    },
    {
      href: '/pulse',
      titleAr: 'نبض السوق',
      subtitleAr: 'الأخبار والاتجاهات',
      icon: <Activity className={iconCls} strokeWidth={1.8} />,
    },
  ]
}

export default function ModeTabs () {
  const pathname = usePathname()
  const router = useRouter()
  const MODES = modes()
  const active = MODES.find(m => pathname === m.href || pathname.startsWith(m.href + '/'))?.href ?? null

  function go (href: string) {
    if (href === active) return
    router.push(href)
  }

  return (
    <nav
      dir="rtl"
      aria-label="أوضاع سيارة"
      className="flex items-center gap-2 sm:justify-center overflow-x-auto no-scrollbar snap-x snap-mandatory"
      style={{ scrollPaddingInline: 8 }}
    >
      {MODES.map(m => {
        const isActive = active === m.href
        return (
          <button
            key={m.href}
            onClick={() => go(m.href)}
            aria-pressed={isActive}
            aria-current={isActive ? 'page' : undefined}
            className="relative shrink-0 snap-start text-right rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 transition-all"
            style={{
              width: 'var(--tab-w, 160px)',
              height: 'var(--tab-h, 52px)',
              background: isActive
                ? 'rgba(216,166,108,0.10)'
                : 'rgba(255,255,255,0.04)',
              border: `1px solid ${isActive ? GOLD : 'rgba(255,255,255,0.08)'}`,
              boxShadow: isActive
                ? '0 6px 16px -8px rgba(216,166,108,0.40), inset 0 1px 0 rgba(255,255,255,0.06)'
                : 'none',
              transform: isActive ? 'translateY(-1px)' : 'none',
            }}
          >
            <style>{`
              :root { --tab-w: 160px; --tab-h: 52px; }
              @media (min-width: 640px) { :root { --tab-w: 220px; --tab-h: 64px; } }
            `}</style>

            {/* You-are-here dot */}
            {isActive && (
              <span
                aria-hidden
                className="absolute top-1.5 right-1.5 inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: GOLD }}
              />
            )}

            <div className="h-full flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4">
              <span
                aria-hidden
                className="shrink-0 inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg"
                style={{
                  background: isActive ? 'rgba(216,166,108,0.18)' : 'rgba(255,255,255,0.05)',
                  color: isActive ? GOLD : 'rgba(255,255,255,0.78)',
                }}
              >
                {m.icon}
              </span>
              <div className="flex flex-col min-w-0">
                <span
                  className="font-extrabold leading-tight truncate"
                  style={{
                    color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.92)',
                    fontSize: 14,
                    lineHeight: '18px',
                  }}
                >
                  {m.titleAr}
                </span>
                <span
                  className="hidden sm:block leading-snug truncate"
                  style={{
                    color: isActive ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.48)',
                    fontSize: 12,
                    fontWeight: 400,
                  }}
                >
                  {m.subtitleAr}
                </span>
              </div>
            </div>
          </button>
        )
      })}
    </nav>
  )
}
