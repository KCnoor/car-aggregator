'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowRight, ArrowLeft, ExternalLink } from 'lucide-react'
import type { Listing } from '@/lib/supabase'
import { translations, cityLabel } from '@/lib/translations'
import { useLang } from '@/app/components/LangContext'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'
import ListingCard, { cardVariants } from '@/app/components/ListingCard'

// Source badge palette — same set as ListingCard so the grid and detail
// page paint the source identically.
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

// Same 4-tier rule as ListingCard — keeps the badge style consistent
// across grid and detail.
function dealConfig (score: number | null): { label: string; bg: string } | null {
  if (score == null) return null
  if (score >= 9.0) return { label: 'صفقة ممتازة', bg: '#10B981' }
  if (score >= 8.0) return { label: 'صفقة جيدة',  bg: '#34D399' }
  if (score >= 7.0) return { label: 'سعر عادل',   bg: '#64748B' }
  if (score >= 6.0) return { label: 'سعر سوقي',   bg: '#94A3B8' }
  return null
}

type Row = { label: string; value: string | null | undefined }

function InfoRow ({ label, value }: Row) {
  if (!value) return null
  return (
    <div className="flex justify-between items-start py-2.5">
      <span style={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: 400 }}>{label}</span>
      <span className="text-end max-w-[55%]" style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>{value}</span>
    </div>
  )
}

export default function ListingDetailClient ({
  listing,
  similar,
}: {
  listing: Listing
  similar: Listing[]
}) {
  // Language is owned by the global LangContext (toggled in StickyHeader).
  // No local state — toggling EN anywhere updates this page too.
  const { lang } = useLang()
  const router = useRouter()
  const tr    = translations[lang]
  const make  = lang === 'ar' ? (listing.make_ar  ?? listing.make_en)  : listing.make_en
  const model = lang === 'ar' ? (listing.model_ar ?? listing.model_en) : listing.model_en
  const city  = cityLabel(listing.city_en, lang, listing.city_ar)

  const PROXIED_HOSTS = ['img.gogomotor.com', 'cdn.soum.sa', 'images.soum.sa']
  const proxyUrl = (u: string) => {
    try { return PROXIED_HOSTS.includes(new URL(u).hostname) ? `/api/img-proxy?url=${encodeURIComponent(u)}` : u }
    catch { return u }
  }
  const photos = (listing.photo_urls?.filter(Boolean) ?? []).map(proxyUrl)
  const src    = SOURCES[listing.source] ?? { name: listing.source, cls: 'bg-slate-600 text-white border-0' }
  const deal   = dealConfig(listing.deal_score)

  const title = `${listing.year} ${make} ${model}${listing.trim ? ` · ${listing.trim}` : ''}`

  // Back-link uses router.back() so the user returns to wherever they came
  // from (browse / match / hunt). If there's no history (direct hit, new
  // tab) we fall back to /browse.
  function goBack () {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push('/browse')
  }
  const BackIcon = lang === 'ar' ? ArrowRight : ArrowLeft

  return (
    <div style={{ background: 'var(--bg-page)' }}>
      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* Back-link — single inline row, lives inside the content gutter
            now that the (modes) shell paints the StickyHeader on top. */}
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-1.5 mb-5 transition-opacity hover:opacity-70"
          style={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600 }}
        >
          <BackIcon size={16} strokeWidth={2} />
          <span>{lang === 'ar' ? 'العودة للقائمة' : 'Back to listings'}</span>
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">

          {/* ── Left column ── */}
          <div className="flex flex-col gap-6">

            {/* Photo carousel */}
            {photos.length > 0 ? (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                <Carousel className="w-full overflow-hidden shadow-md" style={{ borderRadius: 20 }}>
                  <CarouselContent>
                    {photos.map((url, i) => (
                      <CarouselItem key={i}>
                        <div className="aspect-[16/10]" style={{ background: 'var(--hairline)' }}>
                          <img
                            src={url}
                            alt={`${make} ${model} — ${lang === 'ar' ? `صورة ${i + 1}` : `photo ${i + 1}`}`}
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
                <p className="text-center mt-1.5" style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  {photos.length} {lang === 'ar' ? 'صورة' : 'photos'}
                </p>
              </motion.div>
            ) : (
              <div className="aspect-[16/10] flex items-center justify-center" style={{ background: 'var(--hairline)', borderRadius: 20 }}>
                <svg className="w-12 h-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--text-secondary)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 9l2-4h14l2 4M3 9v9a1 1 0 001 1h1a1 1 0 001-1v-1h12v1a1 1 0 001 1h1a1 1 0 001-1V9M3 9h18"/>
                </svg>
              </div>
            )}

            {/* Title + badges */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge className={`px-2 py-0.5 ${src.cls}`} style={{ fontSize: 12, fontWeight: 800 }}>{src.name}</Badge>
                {listing.condition === 'new' && (
                  <Badge variant="secondary" style={{ fontSize: 12 }}>
                    {lang === 'ar' ? 'جديد' : 'New'}
                  </Badge>
                )}
              </div>
              <h1 dir="ltr" style={{ color: 'var(--text-primary)', fontSize: 24, fontWeight: 800, lineHeight: 1.3 }}>{title}</h1>
            </motion.div>

            {/* Specs card */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <Card
                className="p-0"
                style={{ background: 'var(--bg-card)', borderRadius: 20, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow-soft)' }}
              >
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
                <Card
                  className="p-0"
                  style={{ background: 'var(--bg-card)', borderRadius: 20, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow-soft)' }}
                >
                  <CardContent className="px-5 py-4">
                    <h2 className="mb-2" style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 800 }}>
                      {lang === 'ar' ? 'وصف الإعلان' : 'Description'}
                    </h2>
                    <p className="whitespace-pre-line" dir="auto" style={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: 400, lineHeight: 1.65 }}>
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
              <Card
                className="p-0"
                style={{ background: 'var(--bg-card)', borderRadius: 20, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow-md)' }}
              >
                <CardContent className="px-5 py-5 flex flex-col gap-4">
                  {/* Price — locked at 32/800 (one notch under the previous
                       4xl/black, matches the locked typography scale). */}
                  <div>
                    {listing.contact_for_price || listing.price_sar == null ? (
                      <p style={{ color: 'var(--text-secondary)', fontSize: 16, fontWeight: 600 }}>{tr.contactForPrice}</p>
                    ) : (
                      <div dir="ltr">
                        <span className="tracking-tight tabular-nums" style={{ color: 'var(--text-primary)', fontSize: 32, fontWeight: 800 }}>
                          {listing.price_sar.toLocaleString()}
                        </span>
                        <span className="ms-2" style={{ color: 'var(--text-secondary)', fontSize: 16, fontWeight: 600 }}>{tr.sar}</span>
                      </div>
                    )}
                  </div>

                  {/* Deal score block — flat pill matches ListingCard tier
                       style. Raw number stays detail-only and is shown
                       even when no tier label fits (score < 6.0). */}
                  {!listing.contact_for_price && listing.deal_score !== null && (
                    <div className="flex items-center gap-3">
                      {deal && (
                        <span
                          className="inline-flex items-center rounded-full text-white shadow-sm"
                          style={{
                            background: deal.bg,
                            padding: '8px 14px',
                            fontSize: 14,
                            fontWeight: 800,
                            lineHeight: 1,
                          }}
                        >
                          {deal.label}
                        </span>
                      )}
                      <div className="flex flex-col leading-tight">
                        <span className="tabular-nums" style={{ color: 'var(--text-primary)', fontSize: 24, fontWeight: 800 }}>
                          {listing.deal_score.toFixed(1)}
                        </span>
                        {listing.score_source === 'ai_valuation' ? (
                          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                            {lang === 'ar' ? 'تحليل ذكي للسوق' : 'AI market analysis'}
                          </span>
                        ) : listing.score_comparables != null ? (
                          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                            {lang === 'ar'
                              ? `مبني على ${listing.score_comparables} سيارة مشابهة`
                              : `Based on ${listing.score_comparables} comps`}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {/* Low price warning */}
                  {listing.low_price_warning && (
                    <div className="flex items-start gap-2" style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 12, padding: '10px 12px' }}>
                      <span style={{ fontSize: 16 }}>⚠️</span>
                      <p style={{ color: '#92400E', fontSize: 12, fontWeight: 600, lineHeight: 1.4 }}>{tr.lowPriceWarning}</p>
                    </div>
                  )}

                  {/* CTA — fires a background freshness check so dead URLs
                       get pruned even before the nightly sweep runs. */}
                  {listing.source_url && (
                    <a
                      href={listing.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        fetch('/api/freshness-check', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: listing.id }),
                          keepalive: true,
                        }).catch(() => { /* fire-and-forget */ })
                      }}
                      className="w-full inline-flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                      style={{
                        background: 'var(--accent-primary)',
                        color: '#FFFFFF',
                        fontSize: 14,
                        fontWeight: 800,
                        padding: '12px 16px',
                        borderRadius: 12,
                      }}
                    >
                      {lang === 'ar'
                        ? `فتح الإعلان على ${SOURCES[listing.source]?.name ?? listing.source}`
                        : `Open on ${SOURCES[listing.source]?.name ?? listing.source}`}
                      <ExternalLink size={16} strokeWidth={2} className="opacity-80" />
                    </a>
                  )}

                  {/* Scraped date */}
                  {listing.scraped_at && (
                    <p className="text-center" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
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
            <h2 className="mb-5" style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 800 }}>
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
