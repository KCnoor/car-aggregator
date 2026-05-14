'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import type { Listing } from '@/lib/supabase'
import { translations, cityLabel, type Lang } from '@/lib/translations'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'
import ListingCard, { cardVariants } from '@/app/components/ListingCard'

const SOURCES: Record<string, { name: string; cls: string }> = {
  syarah:    { name: 'Syarah',     cls: 'bg-blue-600 text-white border-0' },
  haraj:     { name: 'Haraj',      cls: 'bg-orange-500 text-white border-0' },
  motory:    { name: 'Motory',     cls: 'bg-violet-600 text-white border-0' },
  soum:       { name: 'Soum',        cls: 'bg-green-600 text-white border-0' },
  gogomotor:  { name: 'GoGoMotor',   cls: 'bg-red-600 text-white border-0' },
  saudisale:  { name: 'Saudi Sale',  cls: 'bg-amber-500 text-white border-0' },
  yallamotor: { name: 'Yalla Motor', cls: 'bg-blue-700 text-white border-0' },
  carswitch:  { name: 'CarSwitch',   cls: 'bg-slate-900 text-white border-0' },
  carly:      { name: 'Carly',       cls: 'bg-emerald-500 text-white border-0' },
}

function dealConfig(score: number | null) {
  if (score === null) return { label: '—', bg: 'bg-muted', text: 'text-muted-foreground' }
  if (score >= 9) return { label: 'صفقة ممتازة', bg: 'bg-deal-great',     text: 'text-white' }
  if (score >= 7) return { label: 'صفقة جيدة',  bg: 'bg-deal-good',      text: 'text-white' }
  if (score >= 5) return { label: 'سعر عادل',   bg: 'bg-deal-fair',      text: 'text-white' }
  if (score >= 3) return { label: 'سعر مرتفع',  bg: 'bg-deal-expensive', text: 'text-white' }
  return           { label: 'سعر مبالغ',        bg: 'bg-deal-overpriced',text: 'text-white' }
}

type Row = { label: string; value: string | null | undefined }

function InfoRow({ label, value }: Row) {
  if (!value) return null
  return (
    <div className="flex justify-between items-start py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground text-end max-w-[55%]">{value}</span>
    </div>
  )
}

export default function ListingDetailClient({
  listing,
  similar,
}: {
  listing: Listing
  similar: Listing[]
}) {
  const [lang, setLang] = useState<Lang>('ar')
  const tr    = translations[lang]
  const make  = lang === 'ar' ? (listing.make_ar  ?? listing.make_en)  : listing.make_en
  const model = lang === 'ar' ? (listing.model_ar ?? listing.model_en) : listing.model_en
  const city  = cityLabel(listing.city_en, lang, listing.city_ar)

  const PROXIED_HOSTS = ['img.gogomotor.com', 'cdn.soum.sa', 'images.soum.sa']
  const proxyUrl = (u: string) =>
    PROXIED_HOSTS.some(h => u.includes(h)) ? `/api/img-proxy?url=${encodeURIComponent(u)}` : u
  const photos = (listing.photo_urls?.filter(Boolean) ?? []).map(proxyUrl)
  const src    = SOURCES[listing.source] ?? { name: listing.source, cls: 'bg-slate-600 text-white border-0' }
  const deal   = dealConfig(listing.deal_score)

  const title = `${listing.year} ${make} ${model}${listing.trim ? ` · ${listing.trim}` : ''}`

  return (
    <div className="min-h-screen bg-background" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* ── Nav bar ── */}
      <nav className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={lang === 'ar' ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'} />
            </svg>
            <span className="text-sm font-medium">
              {lang === 'ar' ? 'العودة للقائمة' : 'Back to listings'}
            </span>
          </Link>
          <span className="inline-flex items-baseline gap-1 leading-none">
            <span className="font-logo font-bold text-foreground text-xl tracking-wide">سيارة</span>
            <span className="font-bold text-base tracking-tight" style={{ fontFamily: 'var(--font-geist), Geist, sans-serif', color: 'oklch(0.62 0.14 60)' }}>AI</span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLang(l => l === 'ar' ? 'en' : 'ar')}
            className="text-xs font-semibold"
          >
            {tr.toggleLang}
          </Button>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">

          {/* ── Left column ── */}
          <div className="flex flex-col gap-6">

            {/* Photo carousel */}
            {photos.length > 0 ? (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                <Carousel className="w-full rounded-2xl overflow-hidden shadow-md">
                  <CarouselContent>
                    {photos.map((url, i) => (
                      <CarouselItem key={i}>
                        <div className="aspect-[16/10] bg-muted">
                          <img
                            src={url}
                            alt={`${make} ${model} — صورة ${i + 1}`}
                            className="w-full h-full object-cover"
                            loading={i === 0 ? 'eager' : 'lazy'}
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  {photos.length > 1 && (
                    <>
                      <CarouselPrevious className="left-3" />
                      <CarouselNext className="right-3" />
                    </>
                  )}
                </Carousel>
                <p className="text-xs text-muted-foreground text-center mt-1.5">
                  {photos.length} {lang === 'ar' ? 'صورة' : 'photos'}
                </p>
              </motion.div>
            ) : (
              <div className="aspect-[16/10] bg-muted rounded-2xl flex items-center justify-center">
                <svg className="w-12 h-12 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 9l2-4h14l2 4M3 9v9a1 1 0 001 1h1a1 1 0 001-1v-1h12v1a1 1 0 001 1h1a1 1 0 001-1V9M3 9h18"/>
                </svg>
              </div>
            )}

            {/* Title + badges */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge className={`text-[11px] font-bold px-2 py-0.5 ${src.cls}`}>{src.name}</Badge>
                {listing.condition === 'new' && (
                  <Badge variant="secondary" className="text-[11px]">
                    {lang === 'ar' ? 'جديد' : 'New'}
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl font-black text-foreground leading-snug" dir="ltr">{title}</h1>
            </motion.div>

            {/* Specs card */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <Card className="rounded-2xl border border-border/60 shadow-sm p-0">
                <CardContent className="px-5 py-1">
                  <InfoRow label={lang === 'ar' ? 'الماركة' : 'Make'} value={lang === 'ar' ? listing.make_ar : listing.make_en} />
                  <Separator />
                  <InfoRow label={lang === 'ar' ? 'الموديل' : 'Model'} value={lang === 'ar' ? listing.model_ar : listing.model_en} />
                  <Separator />
                  <InfoRow label={lang === 'ar' ? 'الفئة' : 'Trim'} value={listing.trim} />
                  {listing.trim && <Separator />}
                  <InfoRow label={lang === 'ar' ? 'سنة الصنع' : 'Year'} value={listing.year?.toString()} />
                  <Separator />
                  <InfoRow label={lang === 'ar' ? 'المدينة' : 'City'} value={city || undefined} />
                  {city && <Separator />}
                  <InfoRow label={lang === 'ar' ? 'اللون' : 'Color'} value={lang === 'ar' ? listing.color_ar : listing.color_en} />
                  {(listing.color_en) && <Separator />}
                  <InfoRow
                    label={lang === 'ar' ? 'العداد' : 'Mileage'}
                    value={listing.mileage_km ? `${listing.mileage_km.toLocaleString()} ${tr.km}` : undefined}
                  />
                  {listing.mileage_km && <Separator />}
                  <InfoRow label={lang === 'ar' ? 'ناقل الحركة' : 'Transmission'} value={listing.transmission_slug} />
                  {listing.transmission_slug && <Separator />}
                  <InfoRow label={lang === 'ar' ? 'نوع الوقود' : 'Fuel'} value={listing.fuel_type_slug} />
                  {listing.fuel_type_slug && <Separator />}
                  <InfoRow label={lang === 'ar' ? 'نوع الهيكل' : 'Body'} value={listing.body_type_slug} />
                  {listing.body_type_slug && <Separator />}
                  <InfoRow
                    label={lang === 'ar' ? 'البائع' : 'Seller'}
                    value={listing.seller_type === 'dealer'
                      ? (lang === 'ar' ? 'معرض' : 'Dealer')
                      : (lang === 'ar' ? 'مالك مباشر' : 'Private seller')}
                  />
                </CardContent>
              </Card>
            </motion.div>

            {/* Description */}
            {listing.description_ar && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <Card className="rounded-2xl border border-border/60 shadow-sm p-0">
                  <CardContent className="px-5 py-4">
                    <h2 className="text-sm font-bold text-foreground mb-2">
                      {lang === 'ar' ? 'وصف الإعلان' : 'Description'}
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line" dir="auto">
                      {listing.description_ar}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>

          {/* ── Right column (price + deal score + CTA) ── */}
          <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
              <Card className="rounded-2xl border border-border/60 shadow-md p-0">
                <CardContent className="px-5 py-5 flex flex-col gap-4">
                  {/* Price */}
                  <div>
                    {listing.contact_for_price || listing.price_sar == null ? (
                      <p className="text-base font-semibold text-muted-foreground">{tr.contactForPrice}</p>
                    ) : (
                      <div dir="ltr">
                        <span className="text-4xl font-black text-foreground tracking-tight">
                          {listing.price_sar.toLocaleString()}
                        </span>
                        <span className="text-lg font-medium text-muted-foreground ms-2">{tr.sar}</span>
                      </div>
                    )}
                  </div>

                  {/* Deal score block */}
                  {!listing.contact_for_price && listing.deal_score !== null && (
                    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl ${deal.bg}`}>
                      <span className={`text-3xl font-black leading-none ${deal.text}`}>
                        {listing.deal_score.toFixed(1)}
                      </span>
                      <div>
                        <p className={`text-sm font-bold ${deal.text}`}>{deal.label}</p>
                        {listing.score_source === 'ai_valuation' ? (
                          <p className={`text-xs opacity-80 ${deal.text}`}>
                            {lang === 'ar' ? 'تحليل ذكي للسوق' : 'AI market analysis'}
                          </p>
                        ) : listing.score_comparables != null ? (
                          <p className={`text-xs opacity-80 ${deal.text}`}>
                            {lang === 'ar'
                              ? `مبني على ${listing.score_comparables} سيارة مشابهة`
                              : `Based on ${listing.score_comparables} comps`}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {/* Low price warning */}
                  {listing.low_price_warning && (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                      <span className="text-base">⚠️</span>
                      <p className="text-xs font-medium text-amber-800 leading-snug">{tr.lowPriceWarning}</p>
                    </div>
                  )}

                  {/* CTA */}
                  {listing.source_url && (
                    <a
                      href={listing.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonVariants({ variant: 'default', size: 'lg' }) + ' w-full rounded-xl font-bold text-sm justify-center'}
                    >
                      {lang === 'ar'
                        ? `فتح الإعلان على ${SOURCES[listing.source]?.name ?? listing.source}`
                        : `Open on ${SOURCES[listing.source]?.name ?? listing.source}`}
                      <svg className="w-4 h-4 ms-2 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                      </svg>
                    </a>
                  )}

                  {/* Scraped date */}
                  {listing.scraped_at && (
                    <p className="text-[11px] text-muted-foreground text-center">
                      {lang === 'ar' ? 'آخر تحديث: ' : 'Last updated: '}
                      {new Date(listing.scraped_at).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB')}
                    </p>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>

        {/* ── Similar listings ── */}
        {similar.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-12"
          >
            <h2 className="text-lg font-bold text-foreground mb-5">
              {lang === 'ar' ? `سيارات ${make} ${model} مشابهة` : `Similar ${make} ${model} listings`}
            </h2>
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{ hidden: { opacity: 1 }, visible: { transition: { staggerChildren: 0.04 } } }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {similar.map((l, i) => (
                <motion.div key={l.id} custom={i} variants={cardVariants} initial="hidden" animate="visible">
                  <ListingCard listing={l} lang={lang} index={i} />
                </motion.div>
              ))}
            </motion.div>
          </motion.section>
        )}
      </div>
    </div>
  )
}
