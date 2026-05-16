'use strict'
// Export favicon / app icons / OG image from the canonical BrandMark SVG.
// Single source of truth lives in app/components/Brand.tsx; the SVG body
// below MUST stay in sync if the mark ever changes.
//
// Usage: node scripts/export_brand_assets.js
//
// Outputs (all under public/):
//   favicon.ico (32×32 PNG inside .ico container — modern browsers accept)
//   favicon-16.png, favicon-32.png
//   apple-touch-icon.png (180×180)
//   icon-512.png (PWA / Android home screen)
//   og-image.png (1200×630, sky background + wordmark)
//   brand-mark.svg (raw vector — useful for inline references)

const fs    = require('fs')
const path  = require('path')
const sharp = require('sharp')

const PUBLIC = path.join(__dirname, '..', 'public')

function markSvg () {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>
      <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#0F172A" flood-opacity="0.06" />
      </filter>
    </defs>
    <rect x="2" y="2" width="60" height="60" rx="15"
          fill="#FFFFFF" stroke="rgba(15,23,42,0.04)" stroke-width="1" filter="url(#s)"/>
    <path d="M14 42 L20 42 C22 32 26 28 32 28 C38 28 42 32 44 42 L50 42"
          fill="none" stroke="#0E1B2C" stroke-width="3.6"
          stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="20" cy="45" r="3.3" fill="#FF6B4A"/>
    <circle cx="44" cy="45" r="3.3" fill="#FF6B4A"/>
    <path d="M44 16 L45.6 21.4 L51 23 L45.6 24.6 L44 30 L42.4 24.6 L37 23 L42.4 21.4 Z"
          fill="#10B981"/>
  </svg>`
}

function ogSvg () {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#E0F2FE"/>
        <stop offset="1" stop-color="#DBEAFE"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#sky)"/>
    <g transform="translate(420 175) scale(4.4)">
      <rect x="2" y="2" width="60" height="60" rx="15" fill="#FFFFFF" stroke="rgba(15,23,42,0.04)" stroke-width="1"/>
      <path d="M14 42 L20 42 C22 32 26 28 32 28 C38 28 42 32 44 42 L50 42"
            fill="none" stroke="#0E1B2C" stroke-width="3.6"
            stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="20" cy="45" r="3.3" fill="#FF6B4A"/>
      <circle cx="44" cy="45" r="3.3" fill="#FF6B4A"/>
      <path d="M44 16 L45.6 21.4 L51 23 L45.6 24.6 L44 30 L42.4 24.6 L37 23 L42.4 21.4 Z" fill="#10B981"/>
    </g>
    <text x="600" y="540" text-anchor="middle"
          font-family="system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif"
          font-size="56" font-weight="900" fill="#0E1B2C">سيّارة AI</text>
    <text x="600" y="585" text-anchor="middle"
          font-family="system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif"
          font-size="22" font-weight="600" fill="#64748B">تجميع · تحليل · قرار</text>
  </svg>`
}

;(async () => {
  const buf = Buffer.from(markSvg())
  const tasks = [
    { out: 'icon-512.png',         size: 512 },
    { out: 'apple-touch-icon.png', size: 180 },
    { out: 'favicon-32.png',       size: 32 },
    { out: 'favicon-16.png',       size: 16 },
  ]
  for (const t of tasks) {
    await sharp(buf, { density: 600 })
      .resize(t.size, t.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(PUBLIC, t.out))
    console.log(`  ${t.out}  ${t.size}×${t.size}`)
  }
  await sharp(buf, { density: 600 }).resize(32, 32).png().toFile(path.join(PUBLIC, 'favicon.ico'))
  console.log(`  favicon.ico  (32×32 PNG)`)

  await sharp(Buffer.from(ogSvg()), { density: 300 })
    .resize(1200, 630)
    .png()
    .toFile(path.join(PUBLIC, 'og-image.png'))
  console.log(`  og-image.png  1200×630`)

  fs.writeFileSync(path.join(PUBLIC, 'brand-mark.svg'), markSvg())
  console.log(`  brand-mark.svg`)
})()
