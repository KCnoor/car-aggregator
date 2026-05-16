// Brand identity: a single source of truth for the سيارة AI mark + wordmark.
// Two exports:
//   <BrandMark size={N} /> — just the rounded white tile with the car + sparkle,
//   for favicons, social cards, loading states, anywhere the wordmark is too wide.
//   <Logo size="lg" | "sm" /> — the full RTL lockup: wordmark + AI badge + mark.
//
// Implementation notes:
//   - All artwork is inline SVG so consumers can render at any size without
//     fetching an asset and so we can tint or animate parts in the future.
//   - viewBox 0 0 64 64 for the mark — scale via the `size` prop.
//   - The tagline is optional and hides under 640px when `responsive` is true.

import * as React from 'react'

const NAVY  = '#0E1B2C'
const CORAL = '#FF6B4A'
const EMERALD = '#10B981'

export function BrandMark ({
  size = 48,
  ariaLabel = 'سيارة AI',
  withTileShadow = true,
}: {
  size?: number
  ariaLabel?: string
  withTileShadow?: boolean
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={ariaLabel}
      style={{ display: 'block' }}
    >
      {/* Tile (rounded white square with hairline + soft shadow) */}
      <defs>
        <filter id="brand-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#0F172A" floodOpacity="0.06" />
        </filter>
      </defs>

      <rect
        x="2" y="2" width="60" height="60"
        rx="15"   /* 24% of 64 ≈ 15.4 → 15 */
        fill="#FFFFFF"
        stroke="rgba(15,23,42,0.04)"
        strokeWidth="1"
        filter={withTileShadow ? 'url(#brand-shadow)' : undefined}
      />

      {/* Car chassis — a stylised side silhouette: flat ground line that
          bows up over the cabin between the two wheels. */}
      <path
        d="M14 42 L20 42 C22 32 26 28 32 28 C38 28 42 32 44 42 L50 42"
        fill="none"
        stroke={NAVY}
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Wheels — coral filled circles bottom-left + bottom-right */}
      <circle cx="20" cy="45" r="3.3" fill={CORAL} />
      <circle cx="44" cy="45" r="3.3" fill={CORAL} />

      {/* Four-pointed sparkle on the roof — emerald, signals AI */}
      <path
        d="M44 16
           L45.6 21.4
           L51 23
           L45.6 24.6
           L44 30
           L42.4 24.6
           L37 23
           L42.4 21.4
           Z"
        fill={EMERALD}
      />
    </svg>
  )
}

export function Logo ({
  size = 'lg',
  showTagline = true,
}: {
  /** `lg` = header desktop, `sm` = header mobile / compact contexts */
  size?: 'lg' | 'sm'
  /** Hide the tagline regardless of breakpoint */
  showTagline?: boolean
}) {
  const sizes = size === 'lg'
    ? { wordmark: 40, ai: 16, mark: 48, tagline: 13 }
    : { wordmark: 28, ai: 12, mark: 36, tagline: 11 }

  return (
    <div
      dir="rtl"
      className="inline-flex items-center select-none"
      style={{ gap: size === 'lg' ? 14 : 10 }}
    >
      {/* Mark on the right (RTL first child) */}
      <BrandMark size={sizes.mark} />

      <div className="flex flex-col items-start" style={{ gap: 2 }}>
        {/* Wordmark + AI badge row */}
        <div className="inline-flex items-center" style={{ gap: 8 }}>
          <span
            style={{
              color: NAVY,
              fontFamily: 'var(--font-reem-kufi), var(--font-tajawal), sans-serif',
              fontSize: sizes.wordmark,
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: '-0.01em',
            }}
          >
            سيّارة
          </span>
          <span
            aria-hidden
            className="inline-flex items-center justify-center"
            style={{
              background: CORAL,
              color: '#FFFFFF',
              fontFamily: 'var(--font-geist), Geist, sans-serif',
              fontSize: sizes.ai,
              fontWeight: 900,
              letterSpacing: '0.02em',
              borderRadius: 8,    /* ~12% of badge height */
              padding: size === 'lg' ? '4px 7px' : '3px 6px',
              lineHeight: 1,
            }}
          >
            AI
          </span>
        </div>

        {/* Tagline (desktop only when responsive) */}
        {showTagline && (
          <span
            className={size === 'lg' ? 'hidden sm:inline-block' : 'inline-block'}
            style={{
              color: 'var(--text-secondary)',
              fontSize: sizes.tagline,
              fontWeight: 600,
              lineHeight: 1.2,
            }}
          >
            تجميع، تحليل، قرار
          </span>
        )}
      </div>
    </div>
  )
}
