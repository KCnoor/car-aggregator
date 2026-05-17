'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Listing } from '@/lib/supabase'
import { translations, cityLabel, type Lang } from '@/lib/translations'

// ── Source badge config ───────────────────────────────────────────────────────
const SOURCES: Record<string, { name: string; cls: string }> = {
  syarah:     { name: 'Syarah',      cls: 'bg-blue-600 text-white border-0' },
  haraj:      { name: 'Haraj',       cls: 'bg-orange-500 text-white border-0' },
  motory:     { name: 'Motory',      cls: 'bg-violet-600 text-white border-0' },
  soum:       { name: 'Soum',        cls: 'bg-green-600 text-white border-0' },
  gogomotor:  { name: 'GoGoMotor',   cls: 'bg-red-600 text-white border-0' },
  saudisale:  { name: 'Saudi Sale',  cls: 'bg-amber-500 text-white border-0' },
  yallamotor: { name: 'Yalla Motor', cls: 'bg-blue-700 text-white border-0' },
  carswitch:  { name: 'CarSwitch',   cls: 'bg-slate-900 text-white border-0' },
  digitalcar: { name: 'DigitalCar',  cls: 'bg-rose-600 text-white border-0' },
  dubizzle:   { name: 'Dubizzle',    cls: 'bg-red-700 text-white border-0' },
  carly:      { name: 'Carly',       cls: 'bg-emerald-500 text-white border-0' },
}

// ── Deal score helpers ────────────────────────────────────────────────────────
// 4-tier rule (raw number lives on the detail page only):
//   9.0+    صفقة ممتازة / Excellent deal  emerald  #10B981
//   8.0–8.9 صفقة جيدة   / Good deal       bright   #34D399
//   7.0–7.9 سعر عادل    / Fair price      slate    #64748B
//   6.0–6.9 سعر سوقي    / Market price    slate-400 #94A3B8
//   <6.0    no badge
function dealConfig (score: number | null, lang: Lang): { label: string; bg: string } | null {
  if (score == null) return null
  if (score >= 9.0) return { label: lang === 'ar' ? 'صفقة ممتازة' : 'Excellent deal', bg: '#10B981' }
  if (score >= 8.0) return { label: lang === 'ar' ? 'صفقة جيدة'   : 'Good deal',      bg: '#34D399' }
  if (score >= 7.0) return { label: lang === 'ar' ? 'سعر عادل'    : 'Fair price',     bg: '#64748B' }
  if (score >= 6.0) return { label: lang === 'ar' ? 'سعر سوقي'    : 'Market price',   bg: '#94A3B8' }
  return null
}

// ── Card animation variants ───────────────────────────────────────────────────
export const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, delay: i * 0.04, ease: 'easeOut' as const },
  }),
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ListingCard({
  listing,
  lang,
  index = 0,
}: {
  listing: Listing
  lang: Lang
  index?: number
}) {
  const tr    = translations[lang]
  const make  = lang === 'ar' ? (listing.make_ar  ?? listing.make_en)  : listing.make_en
  const model = lang === 'ar' ? (listing.model_ar ?? listing.model_en) : listing.model_en
  const city  = cityLabel(listing.city_en, lang, listing.city_ar)

  const rawPhoto = listing.photo_urls?.[0] ?? null
  const PROXIED_HOSTS = ['img.gogomotor.com', 'cdn.soum.sa', 'images.soum.sa']
  const needsProxy = rawPhoto && (() => {
    try { return PROXIED_HOSTS.includes(new URL(rawPhoto).hostname) } catch { return false }
  })()
  const photo = needsProxy ? `/api/img-proxy?url=${encodeURIComponent(rawPhoto!)}` : rawPhoto
  const src     = SOURCES[listing.source] ?? { name: listing.source, cls: 'bg-slate-600 text-white border-0' }
  const deal = dealConfig(listing.deal_score, lang)
  const hasBadge = !listing.contact_for_price && deal !== null

  return (
    <motion.div
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="card-lift"
    >
      <Link href={`/listings/${listing.id}`} className="block">
        <Card
          className="overflow-hidden border p-0 gap-0"
          style={{
            borderRadius: 20,
            borderColor: 'var(--hairline)',
            background: 'var(--bg-card)',
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          {/* ── Image + overlays (16:9) ── */}
          <div
            className="relative w-full bg-muted overflow-hidden"
            style={{ aspectRatio: '16 / 9', borderTopLeftRadius: 20, borderTopRightRadius: 20 }}
          >
            {photo ? (
              <img
                src={photo}
                alt={`${make} ${model}`}
                className="w-full h-full object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              // Intentional placeholder: when a source ships JS-rendered photos
              // we can't easily proxy (Dubizzle), or when an individual listing
              // is genuinely photo-less, render a styled tile with the car's
              // identity instead of a broken-icon placeholder.
              <div
                className="w-full h-full flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #1a2942 0%, #2d4566 50%, #1a2942 100%)',
                }}
              >
                <div className="flex flex-col items-center text-center px-4">
                  <svg
                    className="w-9 h-9 mb-2 opacity-60"
                    style={{ color: '#D4A574' }}
                    fill="currentColor" viewBox="0 0 24 24"
                  >
                    <path d="M19 17h2v-6l-3-5h-1V4H4v2H3v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h2c0 1.66 1.34 3 3 3s3-1.34 3-3zM6 6h10v3H4.81L6 6.5V6zm2 12.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm8 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
                  </svg>
                  <span className="text-white text-sm font-bold leading-tight" dir="ltr">
                    {listing.year ?? ''} {make}
                  </span>
                  <span className="text-white/70 text-xs font-medium mt-0.5" dir="ltr">
                    {model}
                  </span>
                </div>
              </div>
            )}

            {/* Tier badge — top-LEFT (RTL leading-edge). Label only; the
                raw deal_score number lives on the detail page now. */}
            {hasBadge && (
              <div
                className="absolute top-2.5 left-2.5 rounded-full shadow-md"
                style={{
                  background: deal!.bg,
                  color: '#FFFFFF',
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 800,
                  lineHeight: 1,
                }}
              >
                {deal!.label}
              </div>
            )}

            {/* Contact-for-price indicator (when no badge) */}
            {listing.contact_for_price && !hasBadge && (
              <div className="absolute top-2.5 left-2.5 bg-black/50 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-1 rounded-lg">
                {tr.contactForPrice}
              </div>
            )}

            {/* Source badge — top-RIGHT overlay (per redesign spec) */}
            <div className="absolute top-2.5 right-2.5 flex flex-col items-end gap-1">
              <Badge className={`text-[10px] font-bold px-2 py-0.5 rounded-md shadow ${src.cls}`}>
                {src.name}
              </Badge>
              {listing.source === 'dubizzle' && (
                <span
                  className="inline-flex items-center gap-1 text-[9px] font-semibold leading-none px-1.5 py-0.5 rounded shadow"
                  style={{ background: '#FEF3C7', color: '#92400E' }}
                  title={lang === 'ar'
                    ? 'بعض إعلانات Dubizzle قد تكون لسيارات في الإمارات أو خارج السعودية. تحقق قبل الشراء.'
                    : 'Some Dubizzle listings may be for cars in UAE or outside Saudi Arabia. Verify before purchase.'}
                >
                  ⚠ {lang === 'ar' ? 'تحقق من موقع السيارة' : 'Verify car location'}
                </span>
              )}
            </div>

            {/* Low-price warning pill — subtle flag, bottom-left corner */}
            {listing.low_price_warning && (
              <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold leading-none"
                style={{ background: '#FEF3C7', color: '#92400E' }}>
                ⚠ {tr.lowPriceWarning.split('—')[0].trim()}
              </div>
            )}
          </div>

          {/* ── Card body ── */}
          <CardContent className="px-4 pt-3.5 pb-4 flex flex-col gap-2.5">
            {/* Title — 16px / 800 per spec */}
            <div>
              <h3
                dir="ltr"
                className="leading-snug text-foreground"
                style={{ fontSize: 16, fontWeight: 800 }}
              >
                {listing.year} {make} {model}
              </h3>
              {listing.trim && (
                <p className="text-[11px] text-muted-foreground mt-0.5" dir="ltr">{listing.trim}</p>
              )}
            </div>

            {/* Price — 24px / 900 per spec */}
            <div dir="ltr">
              {listing.contact_for_price || listing.price_sar == null ? (
                <span className="inline-flex items-center px-2.5 py-0.5 bg-muted text-muted-foreground text-xs font-medium rounded-full">
                  {tr.contactForPrice}
                </span>
              ) : (
                <div className="flex items-baseline gap-1">
                  <span
                    className="text-foreground tracking-tight tabular-nums"
                    style={{ fontSize: 24, fontWeight: 900 }}
                  >
                    {listing.price_sar.toLocaleString()}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">{tr.sar}</span>
                </div>
              )}
            </div>

            {/* Meta chips */}
            <div className="flex flex-wrap gap-1.5">
              {city && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted rounded-full px-2.5 py-0.5">
                  <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                  {city}
                </span>
              )}
              {listing.mileage_km != null && (
                <span className="text-[11px] font-medium text-muted-foreground bg-muted rounded-full px-2.5 py-0.5" dir="ltr">
                  {listing.mileage_km.toLocaleString()} {tr.km}
                </span>
              )}
              {listing.color_en && (
                <span className="text-[11px] font-medium text-muted-foreground bg-muted rounded-full px-2.5 py-0.5">
                  {lang === 'ar' ? (listing.color_ar ?? listing.color_en) : listing.color_en}
                </span>
              )}
              {listing.fuel_type_slug && (
                <span className="text-[11px] font-medium text-muted-foreground bg-muted rounded-full px-2.5 py-0.5 capitalize" dir="ltr">
                  {listing.fuel_type_slug}
                </span>
              )}
            </div>

            {/* Seller type */}
            <p className="text-[11px] text-muted-foreground font-medium">
              {listing.seller_type === 'dealer' ? tr.dealer : tr.privateSeller}
            </p>

            {/* Description */}
            {listing.description_ar && (
              <p className="text-[11px] text-muted-foreground line-clamp-2 border-t border-border pt-2.5 leading-relaxed" dir="auto">
                {listing.description_ar}
              </p>
            )}
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  )
}
