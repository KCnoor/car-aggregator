// Brand identity. The artwork is committed as PNGs in public/brand/ —
// see scripts/extract-brand-assets.js for how they're generated from the
// two source files (public/brand/source-logo.png +
// public/brand/source-icons-sprite.png). Do NOT recreate this artwork as
// inline SVG — the PNGs are the canonical, deterministic assets.

import Image from 'next/image'

/** Full RTL lockup (wordmark + AI badge + tagline + mark) — one single
 *  PNG, no overlays or stacking. logo-full.png contains the entire
 *  composition already.
 *
 *  Sized by height to match the live-counter card (56px) on desktop, so
 *  the two anchor elements at the ends of the brand strip read at the
 *  same visual weight. */
export function Logo ({
  size = 'lg',
  priority = false,
}: {
  size?: 'lg' | 'sm'
  priority?: boolean
}) {
  // Native source is ~1367×403 (≈3.39:1). We pick a target height and
  // derive the width so the logo matches the counter card vertically.
  const targetHeight = size === 'lg' ? 56 : 40
  const targetWidth  = Math.round(targetHeight * 3.39)
  return (
    <Image
      src="/brand/logo-full.png"
      alt="سيارة AI — كل إعلانات السيارات في السعودية، من مصدر واحد"
      width={targetWidth}
      height={targetHeight}
      priority={priority}
      sizes={`${targetWidth}px`}
      style={{
        width: targetWidth,
        height: targetHeight,
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
