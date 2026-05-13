import type { Listing } from '@/lib/supabase'

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

function sourceLabel(source: string) {
  return source.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function ListingCard({ listing }: { listing: Listing }) {
  const specs = [listing.body_type, listing.transmission, listing.engine_size]
    .filter(Boolean).join(' · ')

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
          {sourceLabel(listing.source)}
        </span>
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
