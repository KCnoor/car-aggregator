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
function dealConfig(score: number | null): {
  label: string; bg: string; text: string; ring: string
} {
  if (score === null) return { label: '—', bg: 'bg-muted/80', text: 'text-muted-foreground', ring: '' }
  if (score >= 9) return { label: 'صفقة ممتازة', bg: 'bg-deal-great',     text: 'text-white', ring: 'ring-1 ring-white/20' }
  if (score >= 7) return { label: 'صفقة جيدة',  bg: 'bg-deal-good',      text: 'text-white', ring: 'ring-1 ring-white/20' }
  if (score >= 5) return { label: 'سعر عادل',   bg: 'bg-deal-fair',      text: 'text-white', ring: 'ring-1 ring-white/20' }
  if (score >= 3) return { label: 'سعر مرتفع',  bg: 'bg-deal-expensive', text: 'text-white', ring: 'ring-1 ring-white/20' }
  return           { label: 'سعر مبالغ',        bg: 'bg-deal-overpriced',text: 'text-white', ring: 'ring-1 ring-white/20' }
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
  const deal    = dealConfig(listing.deal_score)
  const hasScore = !listing.contact_for_price && listing.deal_score !== null

  const scoreSubtitle = listing.score_source === 'ai_valuation'
    ? (lang === 'ar' ? 'تحليل ذكي' : 'AI analysis')
    : listing.score_comparables != null
      ? (lang === 'ar'
          ? `${listing.score_comparables} سيارة مشابهة`
          : `${listing.score_comparables} comps`)
      : null

  return (
    <motion.div
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="card-lift"
    >
      <Link href={`/listings/${listing.id}`} className="block">
        <Card className="overflow-hidden rounded-2xl border border-border/60 shadow-sm p-0 gap-0">
          {/* ── Image + overlays ── */}
          <div className="relative w-full h-52 bg-muted overflow-hidden">
            {photo ? (
              <img
                src={photo}
                alt={`${make} ${model}`}
                className="w-full h-full object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg className="w-10 h-10 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 9l2-4h14l2 4M3 9v9a1 1 0 001 1h1a1 1 0 001-1v-1h12v1a1 1 0 001 1h1a1 1 0 001-1V9M3 9h18" />
                </svg>
              </div>
            )}

            {/* Deal score — top-right overlay */}
            {hasScore && (
              <div className={`absolute top-2.5 right-2.5 flex flex-col items-center px-2.5 py-1.5 rounded-xl backdrop-blur-sm ${deal.bg} ${deal.ring} shadow-md`}>
                <span className={`text-lg font-black leading-none ${deal.text}`}>
                  {listing.deal_score!.toFixed(1)}
                </span>
                <span className={`text-[9px] font-bold mt-0.5 leading-none whitespace-nowrap ${deal.text} opacity-90`}>
                  {deal.label}
                </span>
                {scoreSubtitle && (
                  <span className={`text-[8px] mt-0.5 leading-none whitespace-nowrap ${deal.text} opacity-70`}>
                    {scoreSubtitle}
                  </span>
                )}
              </div>
            )}

            {/* Contact-for-price indicator */}
            {listing.contact_for_price && (
              <div className="absolute top-2.5 right-2.5 bg-black/50 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-1 rounded-lg">
                {tr.contactForPrice}
              </div>
            )}

            {/* Source badge — top-left overlay */}
            <div className="absolute top-2.5 left-2.5 flex flex-col items-start gap-1">
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
            {/* Title */}
            <div>
              <h3 className="font-bold text-sm text-foreground leading-snug" dir="ltr">
                {listing.year} {make} {model}
              </h3>
              {listing.trim && (
                <p className="text-[11px] text-muted-foreground mt-0.5" dir="ltr">{listing.trim}</p>
              )}
            </div>

            {/* Price */}
            <div dir="ltr">
              {listing.contact_for_price || listing.price_sar == null ? (
                <span className="inline-flex items-center px-2.5 py-0.5 bg-muted text-muted-foreground text-xs font-medium rounded-full">
                  {tr.contactForPrice}
                </span>
              ) : (
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-foreground tracking-tight">
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
