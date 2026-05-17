'use client'

import { useState, useRef, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useLang } from './LangContext'

// Header search input — the 5th element in the mode tab strip.
//
// Layout: clean white card with `overflow: hidden` so the inner button's
// coral background can't bleed past the rounded corners.
//   - Text input: ~70% of width, transparent bg, placeholder in slate-400.
//   - Submit button: ~30% of width on the visual-left, coral bg, white text.
//
// In RTL with default flex-direction:row the FIRST child sits on the right,
// the LAST child on the left. So we put the input first (it appears on the
// right) and the submit button second (appears on the left) — no `order:`
// gymnastics required.
//
// Behaviour: submit → /browse?q=<encoded>. ListingsClient picks up the
// param and runs the existing /api/search pipeline.

export default function SearchBox ({
  className,
  initialValue,
}: {
  className?: string
  initialValue?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { lang } = useLang()
  const [q, setQ] = useState(initialValue ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setQ(initialValue ?? '') }, [initialValue])

  function submit (e: React.FormEvent) {
    e.preventDefault()
    const trimmed = q.trim()
    if (!trimmed) return
    const url = `/browse?q=${encodeURIComponent(trimmed)}`
    if (pathname === '/browse') router.replace(url)
    else                        router.push(url)
  }

  return (
    <form
      onSubmit={submit}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className={className}
      role="search"
      aria-label={lang === 'ar' ? 'بحث ذكي عن سيارة' : 'Smart car search'}
    >
      <div
        className="flex items-stretch h-full w-full"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--hairline)',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        {/* RTL: first child visually sits on the right. Input ~70%. */}
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={lang === 'ar'
            ? 'ابحث عن سيارة، موديل، أو مدينة...'
            : 'Search for a car, model, or city...'}
          dir="auto"
          className="bg-transparent focus:outline-none placeholder:text-slate-400"
          style={{
            flex: '7 1 0%',
            minWidth: 0,
            color: 'var(--text-primary)',
            fontSize: 14,
            paddingInline: 16,
          }}
          aria-label={lang === 'ar' ? 'بحث' : 'Search'}
        />

        {/* Submit button on the visual-left (last in DOM under RTL). 30%. */}
        <button
          type="submit"
          disabled={!q.trim()}
          className="font-extrabold transition-opacity disabled:opacity-50 focus:outline-none"
          style={{
            flex: '3 1 0%',
            background: 'var(--accent-primary)',
            color: '#FFFFFF',
            fontSize: 14,
            fontWeight: 800,
            border: 0,
            // No own radius — the parent's overflow:hidden clips to 16px.
          }}
          aria-label={lang === 'ar' ? 'بحث' : 'Search'}
        >
          {lang === 'ar' ? 'بحث' : 'Search'}
        </button>
      </div>
    </form>
  )
}
