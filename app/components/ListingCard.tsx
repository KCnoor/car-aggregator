'use client'

import type { Listing } from '@/lib/supabase'

const SOURCES: Record<string, { name: string; cls: string; logo?: string }> = {
  sayarah:     { name: 'Sayarah',     cls: 'bg-blue-600 text-white' },
  soum:        { name: 'Soum',        cls: 'bg-emerald-600 text-white' },
  haraj:       { name: 'Haraj',       cls: 'bg-orange-500 text-white', logo: '/logos/haraj.ico' },
  motory:      { name: 'Motory',      cls: 'bg-red-600 text-white' },
  saudi_deals: { name: 'Saudi Deals', cls: 'bg-purple-600 text-white' },
}

function SourceBadge({ source }: { source: string }) {
  const config = SOURCES[source]
  const name = config?.name ?? source.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const cls = config?.cls ?? 'bg-gray-500 text-white'

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
      {config?.logo && (
        <img src={config.logo} alt="" className="h-3.5 w-3.5 object-contain rounded-sm brightness-0 invert" />
      )}
      {name}
    </span>
  )
}

function DealScoreBadge({ score }: { score: number | null }) {
  if (score === null) return null

  let label: string
  let cls: string
  if (score >= 8) {
    label = 'Great Deal'; cls = 'bg-green-100 text-green-800 border-green-200'
  } else if (score >= 6.5) {
    label = 'Good Deal'; cls = 'bg-emerald-50 text-emerald-700 border-emerald-200'
  } else if (score >= 5) {
    label = 'Fair Price'; cls = 'bg-yellow-50 text-yellow-700 border-yellow-200'
  } else {
    label = 'Overpriced'; cls = 'bg-red-50 text-red-700 border-red-200'
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
      {score.toFixed(1)} · {label}
    </span>
  )
}

export default function ListingCard({ listing }: { listing: Listing }) {
  const specs = [listing.body_type, listing.transmission, listing.engine_size]
    .filter(Boolean).join(' · ')

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <SourceBadge source={listing.source} />
        <DealScoreBadge score={listing.deal_score} />
      </div>

      <div>
        <h3 className="text-lg font-bold text-gray-900 leading-tight">
          {listing.year} {listing.make} {listing.model}
        </h3>
        {specs && <p className="text-sm text-gray-500 mt-0.5">{specs}</p>}
      </div>

      <p className="text-2xl font-bold text-gray-900">
        {listing.price.toLocaleString()}{' '}
        <span className="text-base font-normal text-gray-400">SAR</span>
      </p>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-500">
        <span>📍 {listing.city}</span>
        {listing.mileage != null && (
          <span>🔢 {listing.mileage.toLocaleString()} km</span>
        )}
        {listing.color && <span>● {listing.color}</span>}
      </div>

      <p className="text-xs text-gray-400">
        {listing.seller_type === 'dealer' ? '🏢 Dealer' : '👤 Private seller'}
      </p>

      {listing.description && (
        <p className="text-sm text-gray-500 line-clamp-2 border-t border-gray-100 pt-2">
          {listing.description}
        </p>
      )}
    </div>
  )
}
