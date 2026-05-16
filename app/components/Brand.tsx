// Brand identity. The artwork is committed as PNGs in public/brand/ —
// see scripts/extract-brand-assets.js for how they're generated from the
// two source files (public/brand/source-logo.png +
// public/brand/source-icons-sprite.png). Do NOT recreate this artwork as
// inline SVG — the PNGs are the canonical, deterministic assets.

import Image from 'next/image'

/** Full RTL lockup (wordmark + AI badge + tagline + mark) — one single
 *  PNG, no overlays or stacking. logo-full.png contains the entire
 *  composition already. */
export function Logo ({
  size = 'lg',
  priority = false,
}: {
  size?: 'lg' | 'sm'
  priority?: boolean
}) {
  // Native source is ~1367×403 (≈3.39:1). We size to a max-width and let
  // height follow.
  const maxWidth = size === 'lg' ? 240 : 180
  const intrinsicHeight = Math.round(maxWidth / 3.39)
  return (
    <Image
      src="/brand/logo-full.png"
      alt="سيارة AI — مستشارك الذكي للسيارات في السعودية"
      width={maxWidth}
      height={intrinsicHeight}
      priority={priority}
      sizes={`${maxWidth}px`}
      style={{
        width: '100%',
        maxWidth,
        height: 'auto',
        objectFit: 'contain',
        display: 'block',
      }}
    />
  )
}

/** Just the brand mark — used for favicons, app icons, OG card, etc. */
export function BrandMark ({ size = 48 }: { size?: number }) {
  return (
    <Image
      src="/brand/brand-mark.png"
      alt="سيارة AI"
      width={size}
      height={size}
      style={{ width: size, height: size }}
    />
  )
}
