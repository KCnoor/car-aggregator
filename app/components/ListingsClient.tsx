'use client'

import { useState, useMemo } from 'react'
import type { Listing } from '@/lib/supabase'
import ListingCard from './ListingCard'

type SortKey = 'deal_score' | 'price_asc' | 'price_desc' | 'year_desc'

const PRICE_CAPS = [
  { label: 'Under 70,000 SAR', value: '70000' },
  { label: 'Under 100,000 SAR', value: '100000' },
  { label: 'Under 150,000 SAR', value: '150000' },
  { label: 'Under 200,000 SAR', value: '200000' },
]

const MILEAGE_CAPS = [
  { label: 'Under 30,000 km', value: '30000' },
  { label: 'Under 50,000 km', value: '50000' },
  { label: 'Under 80,000 km', value: '80000' },
]

export default function ListingsClient({ listings }: { listings: Listing[] }) {
  const [search, setSearch] = useState('')
  const [make, setMake] = useState('')
  const [city, setCity] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [maxMileage, setMaxMileage] = useState('')
  const [sort, setSort] = useState<SortKey>('deal_score')

  const makes = useMemo(() => [...new Set(listings.map(l => l.make))].sort(), [listings])
  const cities = useMemo(() => [...new Set(listings.map(l => l.city))].sort(), [listings])

  const filtered = useMemo(() => {
    let result = listings

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(l => `${l.make} ${l.model}`.toLowerCase().includes(q))
    }
    if (make) result = result.filter(l => l.make === make)
    if (city) result = result.filter(l => l.city === city)
    if (maxPrice) result = result.filter(l => l.price <= parseInt(maxPrice))
    if (maxMileage) result = result.filter(l => l.mileage == null || l.mileage <= parseInt(maxMileage))

    return [...result].sort((a, b) => {
      if (sort === 'deal_score') return (b.deal_score ?? 0) - (a.deal_score ?? 0)
      if (sort === 'price_asc') return a.price - b.price
      if (sort === 'price_desc') return b.price - a.price
      return b.year - a.year
    })
  }, [listings, search, make, city, maxPrice, maxMileage, sort])

  const hasFilters = search || make || city || maxPrice || maxMileage

  function clearFilters() {
    setSearch(''); setMake(''); setCity(''); setMaxPrice(''); setMaxMileage('')
  }

  const selectCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">CarSa</h1>
            <p className="text-sm text-gray-400">Saudi Arabia car listings aggregator</p>
          </div>
          <span className="text-sm text-gray-400 hidden sm:block">
            {listings.length} listings indexed
          </span>
        </div>
      </header>

      {/* Sticky filter bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Search make or model…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-44 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select value={make} onChange={e => setMake(e.target.value)} className={selectCls}>
            <option value="">All Makes</option>
            {makes.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={city} onChange={e => setCity(e.target.value)} className={selectCls}>
            <option value="">All Cities</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={maxPrice} onChange={e => setMaxPrice(e.target.value)} className={selectCls}>
            <option value="">Any Price</option>
            {PRICE_CAPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={maxMileage} onChange={e => setMaxMileage(e.target.value)} className={selectCls}>
            <option value="">Any Mileage</option>
            {MILEAGE_CAPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={sort} onChange={e => setSort(e.target.value as SortKey)} className={selectCls}>
            <option value="deal_score">Best Deal First</option>
            <option value="price_asc">Price: Low → High</option>
            <option value="price_desc">Price: High → Low</option>
            <option value="year_desc">Newest First</option>
          </select>
        </div>
      </div>

      {/* Results */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-4">
          <p className="text-sm text-gray-500">
            {filtered.length} {filtered.length === 1 ? 'listing' : 'listings'} found
          </p>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-blue-600 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-5xl mb-4">🔍</p>
            <p className="text-lg font-medium text-gray-600">No listings match your filters</p>
            <p className="text-sm mt-1">Try adjusting your search criteria</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(listing => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
