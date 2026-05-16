'use strict'
// Extract logo / mode-icon assets from the two source images:
//   public/brand/source-logo.png         (1872×840, full lockup)
//   public/brand/source-icons-sprite.png (1536×1024, 2 rows × 3 cols)
//
// Outputs:
//   public/brand/logo-full.png         — tightly trimmed lockup for the header
//   public/brand/brand-mark.png        — 512×512 brand mark (from sprite cell [0,1])
//   public/modes/all-market.png        — 256×256 (cell [0,2] globe)
//   public/modes/matchmaker.png        — 256×256 (cell [1,0] person + diamond + car)
//   public/modes/hunter.png            — 256×256 (cell [1,1] radar with target)
//   public/modes/pulse.png             — 256×256 (cell [1,2] bar chart trending up)
//   public/favicon.ico                 — 32×32 PNG (modern browsers accept)
//   public/favicon-16.png, favicon-32.png
//   public/apple-touch-icon.png        — 180×180
//   public/icon-192.png, icon-512.png  — PWA manifest sizes
//
// IMPORTANT: do not redraw the artwork. The source PNGs are the
// canonical assets. This script only crops + resizes them.
//
// Usage:  node scripts/extract-brand-assets.js

const path  = require('path')
const sharp = require('sharp')

const PUBLIC = path.join(__dirname, '..', 'public')
const SOURCE_LOGO   = path.join(PUBLIC, 'brand', 'source-logo.png')
const SOURCE_SPRITE = path.join(PUBLIC, 'brand', 'source-icons-sprite.png')

// Trim a white background and re-pad to `out` size with `marginPct` of
// internal margin so every icon has the same visual breathing room.
async function tightCropToSquare (cropBuffer, out, marginPct = 0.08) {
  // 1. Trim solid white background to bounding box of the artwork.
  const trimmed = await sharp(cropBuffer)
    .trim({ background: { r: 255, g: 255, b: 255 }, threshold: 10 })
    .toBuffer()
  const md = await sharp(trimmed).metadata()
  // 2. Pad to a square canvas so the icon is centered.
  const side = Math.max(md.width, md.height)
  const squared = await sharp(trimmed)
    .extend({
      top:    Math.floor((side - md.height) / 2),
      bottom: Math.ceil ((side - md.height) / 2),
      left:   Math.floor((side - md.width)  / 2),
      right:  Math.ceil ((side - md.width)  / 2),
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .toBuffer()
  // 3. Resize to `out` with a uniform internal margin.
  const inner = Math.round(out * (1 - marginPct * 2))
  return sharp(squared)
    .resize(inner, inner, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .extend({
      top: Math.round(out * marginPct), bottom: Math.round(out * marginPct),
      left: Math.round(out * marginPct), right: Math.round(out * marginPct),
      background: { r: 255, g: 255, b: 255, alpha: 0 },  // transparent margin
    })
    .png()
    .toBuffer()
}

;(async () => {
  // ── Logo full lockup ─────────────────────────────────────────────────────
  // Trim white edges only; preserve aspect ratio (it's a horizontal lockup).
  await sharp(SOURCE_LOGO)
    .trim({ background: { r: 255, g: 255, b: 255 }, threshold: 10 })
    .toFile(path.join(PUBLIC, 'brand', 'logo-full.png'))
  const logoOut = await sharp(path.join(PUBLIC, 'brand', 'logo-full.png')).metadata()
  console.log(`  brand/logo-full.png         ${logoOut.width}×${logoOut.height}  (trimmed)`)

  // ── Sprite cell extraction ───────────────────────────────────────────────
  // Sprite is exactly 1536×1024 → cells are 512×512.
  const spriteMd = await sharp(SOURCE_SPRITE).metadata()
  const cellW = Math.floor(spriteMd.width  / 3)
  const cellH = Math.floor(spriteMd.height / 2)

  async function cell (col, row) {
    return sharp(SOURCE_SPRITE)
      .extract({ left: col * cellW, top: row * cellH, width: cellW, height: cellH })
      .toBuffer()
  }

  // ── Brand mark (cell [0,1] — top-middle, the car silhouette tile) ────────
  const markBuf = await cell(1, 0)
  const markPng = await tightCropToSquare(markBuf, 512, 0.10)
  await require('fs').promises.writeFile(path.join(PUBLIC, 'brand', 'brand-mark.png'), markPng)
  console.log(`  brand/brand-mark.png        512×512`)

  // ── Mode icons (256×256, 8% inner margin) ────────────────────────────────
  const modes = [
    { name: 'all-market',  col: 2, row: 0 },   // globe + colored dots
    { name: 'matchmaker',  col: 0, row: 1 },   // person + diamond + car
    { name: 'hunter',      col: 1, row: 1 },   // radar with target
    { name: 'pulse',       col: 2, row: 1 },   // bar chart trending up
  ]
  for (const m of modes) {
    const buf = await cell(m.col, m.row)
    const png = await tightCropToSquare(buf, 256, 0.08)
    const out = path.join(PUBLIC, 'modes', `${m.name}.png`)
    await require('fs').promises.writeFile(out, png)
    console.log(`  modes/${m.name}.png`.padEnd(36) + ' 256×256')
  }

  // ── Favicons + app icons from the brand mark ─────────────────────────────
  const favTasks = [
    { out: 'favicon-16.png',       size: 16 },
    { out: 'favicon-32.png',       size: 32 },
    { out: 'apple-touch-icon.png', size: 180 },
    { out: 'icon-192.png',         size: 192 },
    { out: 'icon-512.png',         size: 512 },
  ]
  for (const t of favTasks) {
    await sharp(markPng).resize(t.size, t.size).png().toFile(path.join(PUBLIC, t.out))
    console.log(`  ${t.out}`.padEnd(36) + ` ${t.size}×${t.size}`)
  }
  // favicon.ico: 32×32 PNG inside .ico container
  await sharp(markPng).resize(32, 32).png().toFile(path.join(PUBLIC, 'favicon.ico'))
  console.log(`  favicon.ico                  32×32 (PNG)`)
})()
