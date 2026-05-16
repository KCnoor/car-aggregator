'use client'

import { useState, useRef, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

// Header search input — the 5th element in the mode tab strip.
//
// Behaviour:
//   - User types a free-text query and presses Enter or the 'بحث' button.
//   - We push to /browse?q=<encoded>. ListingsClient on /browse picks up
//     the ?q param on mount and dispatches its existing AI-search pipeline.
//   - If the user is already on /browse, navigation replaces the URL in
//     place and the same param effect fires.
//
// Deliberately mic-free. The voice concierge backend is preserved (other
// routes can still hit /api/voice/*) but it has no UI surface here.

const CORAL = 'var(--accent-primary)'

export default function SearchBox ({
  className,
  initialValue,
}: {
  className?: string
  initialValue?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [q, setQ] = useState(initialValue ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep the visible value in sync when the page hands us a fresh
  // initialValue (e.g. cross-route navigation with a different ?q).
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
      dir="rtl"
      className={className}
      role="search"
      aria-label="بحث ذكي عن سيارة"
    >
      <div
        className="flex items-stretch h-full overflow-hidden"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--hairline)',
          borderRadius: 20,
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        {/* Coral search button on the visual-left (RTL trailing edge). */}
        <button
          type="submit"
          disabled={!q.trim()}
          className="shrink-0 font-extrabold transition-opacity disabled:opacity-40 order-2"
          style={{
            background: CORAL,
            color: '#FFFFFF',
            fontSize: 14,
            width: 80,
            borderRadius: 0,
          }}
        >
          بحث
        </button>

        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="ابحث عن سيارة، موديل، أو مدينة..."
          dir="auto"
          className="flex-1 min-w-0 bg-transparent focus:outline-none order-1"
          style={{
            color: 'var(--text-primary)',
            fontSize: 14,
            paddingInlineStart: 16,
            paddingInlineEnd: 12,
          }}
          aria-label="بحث"
        />
      </div>
    </form>
  )
}
