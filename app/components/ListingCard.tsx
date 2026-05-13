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

function DealScoreBadge({ score, lang }: { score: number | null; lang: Lang }) {
  if (score === null) return null
  const tr = translations[lang]
  let label: string
  let cls: string
  if (score >= 8)   { label = tr.greatDeal; cls = 'bg-green-500 text-white' }
  else if (score >= 6.5) { label = tr.goodDeal; cls = 'bg-emerald-500 text-white' }
  else if (score >= 5)   { label = tr.fairPrice; cls = 'bg-amber-400 text-amber-900' }
  else                   { label = tr.overpriced; cls = 'bg-red-100 text-red-600' }

  return (
    <span dir="ltr" className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${cls}`}>
      {score.toFixed(1)} · {label}
    </span>
  )
}

export default function ListingCard({ listing, lang }: { listing: Listing; lang: Lang }) {
  const tr = translations[lang]
  const specs = [listing.body_type, listing.transmission, listing.engine_size]
    .filter(Boolean).join(' · ')

  return (
    <div className={`bg-white rounded-2xl border border-gray-100 border-t-4 ${dealAccentCls(listing.deal_score)} p-5 flex flex-col gap-3 shadow-sm hover:shadow-xl transition-all duration-200 cursor-pointer`}>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <SourceBadge source={listing.source} />
        <DealScoreBadge score={listing.deal_score} lang={lang} />
      </div>

      <div>
        <h3 className="text-base font-bold text-gray-900 leading-snug" dir="ltr">
          {listing.year} {listing.make} {listing.model}
        </h3>
        {specs && <p className="text-xs text-gray-400 mt-0.5" dir="ltr">{specs}</p>}
      </div>

      <div dir="ltr">
        <span className="text-2xl font-black text-gray-900">{listing.price.toLocaleString()}</span>
        {' '}<span className="text-sm font-medium text-gray-400">{tr.sar}</span>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="bg-gray-100 text-gray-600 rounded-full px-2.5 py-0.5">📍 {cityLabel(listing.city, lang)}</span>
        {listing.mileage != null && (
          <span className="bg-gray-100 text-gray-600 rounded-full px-2.5 py-0.5" dir="ltr">
            {listing.mileage.toLocaleString()} {tr.km}
          </span>
        )}
        {listing.color && (
          <span className="bg-gray-100 text-gray-600 rounded-full px-2.5 py-0.5">{listing.color}</span>
        )}
      </div>

      <p className="text-xs text-gray-400">
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
