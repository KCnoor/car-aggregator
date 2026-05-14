'use client'

import type { Listing } from '@/lib/supabase'
import { translations, cityLabel, type Lang } from '@/lib/translations'

const SOURCES: Record<string, { name: string; cls: string }> = {
  syarah: { name: 'Syarah', cls: 'bg-blue-600 text-white' },
  haraj:  { name: 'Haraj',  cls: 'bg-orange-500 text-white' },
}

function dealAccentCls(score: number | null, contactForPrice: boolean): string {
  if (contactForPrice) return 'border-t-gray-300'
  if (score === null)  return 'border-t-gray-200'
  if (score >= 9)   return 'border-t-green-500'
  if (score >= 7)   return 'border-t-emerald-400'
  if (score >= 5)   return 'border-t-amber-400'
  if (score >= 3)   return 'border-t-orange-300'
  return 'border-t-red-300'
}

function SourceBadge({ source }: { source: string }) {
  const config = SOURCES[source]
  const name = config?.name ?? source.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const cls  = config?.cls  ?? 'bg-gray-500 text-white'
  return (
    <span dir="ltr" className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold tracking-wide ${cls}`}>
      {name}
    </span>
  )
}

type TierCfg = { label: string; bg: string; numColor: string; lblColor: string; shadow: string }

function DealScoreBadge({ listing, lang }: { listing: Listing; lang: Lang }) {
  const tr = translations[lang]

  // No price at all — no badge
  if (listing.contact_for_price) return null

  // Has price but group too small → pending
  if (listing.deal_score === null) {
    return (
      <div
        title={tr.pendingEvalTooltip}
        className="inline-flex flex-col items-center px-3 py-1.5 rounded-xl bg-gray-100 shrink-0 cursor-help"
      >
        <span className="text-[10px] font-bold text-gray-400 tracking-wide whitespace-nowrap">
          {tr.pendingEval}
        </span>
      </div>
    )
  }

  const score = listing.deal_score
  let cfg: TierCfg
  if (score >= 9) {
    cfg = { label: tr.greatDeal,  bg: 'bg-green-500',   numColor: 'text-white',       lblColor: 'text-green-100',   shadow: '0 4px 14px rgba(34,197,94,0.45)' }
  } else if (score >= 7) {
    cfg = { label: tr.goodDeal,   bg: 'bg-emerald-500', numColor: 'text-white',       lblColor: 'text-emerald-100', shadow: '0 4px 14px rgba(16,185,129,0.4)' }
  } else if (score >= 5) {
    cfg = { label: tr.fairPrice,  bg: 'bg-amber-400',   numColor: 'text-amber-950',   lblColor: 'text-amber-800',   shadow: '0 4px 14px rgba(251,191,36,0.45)' }
  } else if (score >= 3) {
    cfg = { label: tr.expensive,  bg: 'bg-orange-100',  numColor: 'text-orange-600',  lblColor: 'text-orange-400',  shadow: '0 2px 8px rgba(249,115,22,0.2)' }
  } else {
    cfg = { label: tr.overpriced, bg: 'bg-red-100',     numColor: 'text-red-600',     lblColor: 'text-red-400',     shadow: '0 2px 8px rgba(239,68,68,0.2)' }
  }

  return (
    <div
      dir="ltr"
      className={`inline-flex flex-col items-center px-3 py-1.5 rounded-xl ${cfg.bg} shrink-0`}
      style={{ boxShadow: cfg.shadow }}
    >
      <span className={`text-xl font-black leading-none tracking-tight ${cfg.numColor}`}>
        {score.toFixed(1)}
      </span>
      <span className={`text-[9px] font-bold tracking-wider mt-0.5 leading-none whitespace-nowrap ${cfg.lblColor}`}>
        {cfg.label}
      </span>
    </div>
  )
}

export default function ListingCard({ listing, lang }: { listing: Listing; lang: Lang }) {
  const tr    = translations[lang]
  const make  = lang === 'ar' ? (listing.make_ar  ?? listing.make_en)  : listing.make_en
  const model = lang === 'ar' ? (listing.model_ar ?? listing.model_en) : listing.model_en
  const city  = cityLabel(listing.city_en, lang, listing.city_ar)

  const firstPhoto = listing.photo_urls?.[0] ?? null

  return (
    <a
      href={listing.source_url ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className={`bg-white rounded-2xl border border-gray-100 border-t-4 ${dealAccentCls(listing.deal_score, listing.contact_for_price)} flex flex-col shadow-sm hover:shadow-xl transition-all duration-200 cursor-pointer overflow-hidden`}
    >
      {/* Photo */}
      {firstPhoto && (
        <div className="w-full h-40 bg-gray-100 overflow-hidden">
          <img
            src={firstPhoto}
            alt={`${make} ${model}`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      <div className="p-4 flex flex-col gap-3">
        {/* Source + Deal Score */}
        <div className="flex items-start justify-between gap-2">
          <SourceBadge source={listing.source} />
          <DealScoreBadge listing={listing} lang={lang} />
        </div>

        {/* Title */}
        <div>
          <h3 className="text-sm font-bold text-gray-900 leading-snug" dir="ltr">
            {listing.year} {make} {model}
          </h3>
          {listing.trim && (
            <p className="text-xs text-gray-400 mt-0.5" dir="ltr">{listing.trim}</p>
          )}
        </div>

        {/* Price */}
        <div dir="ltr">
          {listing.contact_for_price || listing.price_sar == null ? (
            <span className="inline-flex items-center px-3 py-1 bg-gray-100 text-gray-600 text-sm font-semibold rounded-full">
              {tr.contactForPrice}
            </span>
          ) : (
            <>
              <span className="text-2xl font-black text-gray-900">
                {listing.price_sar.toLocaleString()}
              </span>
              {' '}
              <span className="text-sm font-medium text-gray-400">{tr.sar}</span>
            </>
          )}
        </div>

        {/* Low-price warning */}
        {listing.low_price_warning && (
          <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            <span className="text-sm">⚠️</span>
            <span className="text-[11px] font-semibold text-amber-800 leading-tight">
              {tr.lowPriceWarning}
            </span>
          </div>
        )}

        {/* Chips */}
        <div className="flex flex-wrap gap-1.5 text-xs">
          {city && (
            <span className="bg-gray-100 text-gray-600 rounded-full px-2.5 py-0.5 font-medium">
              📍 {city}
            </span>
          )}
          {listing.mileage_km != null && (
            <span className="bg-gray-100 text-gray-600 rounded-full px-2.5 py-0.5 font-medium" dir="ltr">
              {listing.mileage_km.toLocaleString()} {tr.km}
            </span>
          )}
          {listing.color_en && (
            <span className="bg-gray-100 text-gray-600 rounded-full px-2.5 py-0.5 font-medium">
              {lang === 'ar' ? (listing.color_ar ?? listing.color_en) : listing.color_en}
            </span>
          )}
          {listing.fuel_type_slug && (
            <span className="bg-gray-100 text-gray-600 rounded-full px-2.5 py-0.5 font-medium" dir="ltr">
              {listing.fuel_type_slug}
            </span>
          )}
        </div>

        <p className="text-xs text-gray-400 font-medium">
          {listing.seller_type === 'dealer' ? tr.dealer : tr.privateSeller}
        </p>

        {listing.description_ar && (
          <p className="text-xs text-gray-500 line-clamp-2 border-t border-gray-100 pt-2.5 leading-relaxed" dir="auto">
            {listing.description_ar}
          </p>
        )}
      </div>
    </a>
  )
}
