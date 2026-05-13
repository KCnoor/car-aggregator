'use client'

import type { Listing } from '@/lib/supabase'
import { translations, cityLabel, type Lang } from '@/lib/translations'

const SOURCES: Record<string, { name: string; cls: string; logo?: string }> = {
  sayarah:     { name: 'Sayarah',     cls: 'bg-blue-600 text-white' },
  soum:        { name: 'Soum',        cls: 'bg-emerald-600 text-white' },
  haraj:       { name: 'Haraj',       cls: 'bg-orange-500 text-white', logo: '/logos/haraj.ico' },
  motory:      { name: 'Motory',      cls: 'bg-red-600 text-white' },
  saudi_deals: { name: 'Saudi Deals', cls: 'bg-purple-600 text-white' },
}

function dealAccentCls(score: number | null): string {
  if (score === null) return 'border-t-gray-200'
  if (score >= 8)   return 'border-t-green-400'
  if (score >= 6.5) return 'border-t-emerald-400'
  if (score >= 5)   return 'border-t-amber-400'
  return 'border-t-red-300'
}

function SourceBadge({ source }: { source: string }) {
  const config = SOURCES[source]
  const name = config?.name ?? source.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const cls = config?.cls ?? 'bg-gray-500 text-white'
  return (
    <span dir="ltr" className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold tracking-wide ${cls}`}>
      {config?.logo && (
        <img src={config.logo} alt="" className="h-3 w-3 object-contain rounded-sm brightness-0 invert" />
      )}
      {name}
    </span>
  )
}

type TierConfig = {
  label: string
  bg: string
  numberColor: string
  labelColor: string
  shadow: string
}

function DealScoreBadge({ score, lang }: { score: number | null; lang: Lang }) {
  if (score === null) return null
  const tr = translations[lang]

  let cfg: TierConfig
  if (score >= 8) {
    cfg = {
      label: tr.greatDeal,
      bg: 'bg-green-500',
      numberColor: 'text-white',
      labelColor: 'text-green-100',
      shadow: '0 4px 14px rgba(34,197,94,0.45)',
    }
  } else if (score >= 6.5) {
    cfg = {
      label: tr.goodDeal,
      bg: 'bg-emerald-500',
      numberColor: 'text-white',
      labelColor: 'text-emerald-100',
      shadow: '0 4px 14px rgba(16,185,129,0.4)',
    }
  } else if (score >= 5) {
    cfg = {
      label: tr.fairPrice,
      bg: 'bg-amber-400',
      numberColor: 'text-amber-950',
      labelColor: 'text-amber-800',
      shadow: '0 4px 14px rgba(251,191,36,0.45)',
    }
  } else {
    cfg = {
      label: tr.overpriced,
      bg: 'bg-red-100',
      numberColor: 'text-red-600',
      labelColor: 'text-red-400',
      shadow: '0 2px 8px rgba(239,68,68,0.2)',
    }
  }

  return (
    <div
      dir="ltr"
      className={`inline-flex flex-col items-center px-3 py-1.5 rounded-xl ${cfg.bg} shrink-0`}
      style={{ boxShadow: cfg.shadow }}
    >
      <span className={`text-xl font-black leading-none tracking-tight ${cfg.numberColor}`}>
        {score.toFixed(1)}
      </span>
      <span className={`text-[9px] font-bold tracking-wider mt-0.5 leading-none whitespace-nowrap ${cfg.labelColor}`}>
        {cfg.label}
      </span>
    </div>
  )
}

export default function ListingCard({ listing, lang }: { listing: Listing; lang: Lang }) {
  const tr = translations[lang]
  const specs = [listing.body_type, listing.transmission, listing.engine_size]
    .filter(Boolean).join(' · ')

  return (
    <div className={`bg-white rounded-2xl border border-gray-100 border-t-4 ${dealAccentCls(listing.deal_score)} p-4 flex flex-col gap-3 shadow-sm hover:shadow-xl transition-all duration-200 cursor-pointer`}>

      <div className="flex items-start justify-between gap-2">
        <SourceBadge source={listing.source} />
        <DealScoreBadge score={listing.deal_score} lang={lang} />
      </div>

      <div>
        <h3 className="text-sm font-bold text-gray-900 leading-snug" dir="ltr">
          {listing.year} {listing.make} {listing.model}
        </h3>
        {specs && <p className="text-xs text-gray-400 mt-0.5" dir="ltr">{specs}</p>}
      </div>

      <div dir="ltr">
        <span className="text-2xl font-black text-gray-900">{listing.price.toLocaleString()}</span>
        {' '}<span className="text-sm font-medium text-gray-400">{tr.sar}</span>
      </div>

      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="bg-gray-100 text-gray-600 rounded-full px-2.5 py-0.5 font-medium">
          📍 {cityLabel(listing.city, lang)}
        </span>
        {listing.mileage != null && (
          <span className="bg-gray-100 text-gray-600 rounded-full px-2.5 py-0.5 font-medium" dir="ltr">
            {listing.mileage.toLocaleString()} {tr.km}
          </span>
        )}
        {listing.color && (
          <span className="bg-gray-100 text-gray-600 rounded-full px-2.5 py-0.5 font-medium">{listing.color}</span>
        )}
      </div>

      <p className="text-xs text-gray-400 font-medium">
        {listing.seller_type === 'dealer' ? tr.dealer : tr.privateSeller}
      </p>

      {listing.description && (
        <p className="text-xs text-gray-500 line-clamp-2 border-t border-gray-100 pt-2.5 leading-relaxed" dir="auto">
          {listing.description}
        </p>
      )}
    </div>
  )
}
