'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import type { Listing } from '@/lib/supabase'
import { translations, cityLabel, type Lang } from '@/lib/translations'
import ListingCard from './ListingCard'

type SortKey = 'deal_score' | 'price_asc' | 'price_desc' | 'year_desc'

type AIFilters = {
  make?: string
  model?: string
  city?: string
  maxPrice?: number
  minPrice?: number
  maxMileage?: number
  minYear?: number
  maxYear?: number
}

export default function ListingsClient({ listings }: { listings: Listing[] }) {
  const [lang, setLang] = useState<Lang>('ar')
  const tr = translations[lang]

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = lang
  }, [lang])

  const [search, setSearch] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [city, setCity] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [maxMileage, setMaxMileage] = useState('')
  const [sort, setSort] = useState<SortKey>('deal_score')

  const [nlQuery, setNlQuery] = useState('')
  const [nlLoading, setNlLoading] = useState(false)
  const [nlSummary, setNlSummary] = useState('')
  const [aiFilters, setAiFilters] = useState<AIFilters>({})
  const nlInputRef = useRef<HTMLInputElement>(null)

  async function handleNlSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!nlQuery.trim() || nlLoading) return
    setNlLoading(true)
    setNlSummary('')
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: nlQuery }),
      })
      const { filters } = await res.json() as { filters: AIFilters }
      setAiFilters(filters)
      setMake(''); setModel(''); setCity(''); setMaxPrice(''); setMaxMileage(''); setSearch('')
      const parts: string[] = []
      if (filters.make) parts.push(filters.make)
      if (filters.model) parts.push(filters.model)
      if (filters.city) parts.push(`${tr.nlIn} ${cityLabel(filters.city, lang)}`)
      if (filters.minYear && filters.maxYear && filters.minYear === filters.maxYear) {
        parts.push(`${tr.nlYear} ${filters.minYear}`)
      } else if (filters.minYear) {
        parts.push(`${tr.nlFrom} ${filters.minYear}`)
      }
      if (filters.maxPrice) parts.push(`${tr.nlUnderPrice} ${filters.maxPrice.toLocaleString()} ${tr.sar}`)
      if (filters.maxMileage) parts.push(`${tr.nlUnderMileage} ${filters.maxMileage.toLocaleString()} ${tr.km}`)
      setNlSummary(parts.length ? `${tr.nlShowing} ${parts.join(tr.separator)}` : tr.nlNoFilters)
    } catch {
      setNlSummary(tr.nlError)
    } finally {
      setNlLoading(false)
    }
  }

  function clearNlSearch() {
    setNlQuery('')
    setAiFilters({})
    setNlSummary('')
    nlInputRef.current?.focus()
  }

  const makes = useMemo(() => [...new Set(listings.map(l => l.make))].sort(), [listings])
  const models = useMemo(() => {
    if (!make) return []
    return [...new Set(listings.filter(l => l.make === make).map(l => l.model))].sort()
  }, [listings, make])
  const cities = useMemo(() => [...new Set(listings.map(l => l.city))].sort(), [listings])

  const filtered = useMemo(() => {
    let result = listings

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(l => `${l.make} ${l.model}`.toLowerCase().includes(q))
    }
    const effectiveMake = aiFilters.make ?? (make || undefined)
    const effectiveModel = aiFilters.model ?? (model || undefined)
    const effectiveCity = aiFilters.city ?? (city || undefined)
    if (effectiveMake) result = result.filter(l => l.make.toLowerCase() === effectiveMake.toLowerCase())
    if (effectiveModel) result = result.filter(l => l.model.toLowerCase() === effectiveModel.toLowerCase())
    if (effectiveCity) result = result.filter(l => l.city === effectiveCity)
    const effectiveMaxPrice = aiFilters.maxPrice ?? (maxPrice ? parseInt(maxPrice) : undefined)
    if (effectiveMaxPrice) result = result.filter(l => l.price <= effectiveMaxPrice)
    if (aiFilters.minPrice) result = result.filter(l => l.price >= aiFilters.minPrice!)
    const effectiveMaxMileage = aiFilters.maxMileage ?? (maxMileage ? parseInt(maxMileage) : undefined)
    if (effectiveMaxMileage) result = result.filter(l => l.mileage == null || l.mileage <= effectiveMaxMileage)
    if (aiFilters.minYear) result = result.filter(l => l.year >= aiFilters.minYear!)
    if (aiFilters.maxYear) result = result.filter(l => l.year <= aiFilters.maxYear!)

    return [...result].sort((a, b) => {
      if (sort === 'deal_score') return (b.deal_score ?? 0) - (a.deal_score ?? 0)
      if (sort === 'price_asc') return a.price - b.price
      if (sort === 'price_desc') return b.price - a.price
      return b.year - a.year
    })
  }, [listings, search, make, model, city, maxPrice, maxMileage, sort, aiFilters])

  const hasFilters = search || make || model || city || maxPrice || maxMileage || Object.keys(aiFilters).length > 0

  function clearFilters() {
    setSearch(''); setMake(''); setModel(''); setCity(''); setMaxPrice(''); setMaxMileage('')
    clearNlSearch()
  }

  const selectCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{tr.title}</h1>
            <p className="text-sm text-gray-400">{tr.subtitle}</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400 hidden sm:block">
              {tr.listingsIndexed(listings.length)}
            </span>
            <button
              onClick={() => setLang(l => l === 'ar' ? 'en' : 'ar')}
              className="text-sm font-medium text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors"
            >
              {tr.toggleLang}
            </button>
          </div>
        </div>
      </header>

      {/* AI natural language search */}
      <div className="bg-blue-50 border-b border-blue-100 px-4 py-4">
        <div className="max-w-7xl mx-auto">
          <form onSubmit={handleNlSearch} className="flex gap-2">
            <input
              ref={nlInputRef}
              type="text"
              placeholder={tr.nlPlaceholder}
              value={nlQuery}
              onChange={e => setNlQuery(e.target.value)}
              dir="auto"
              className="flex-1 border border-blue-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400"
            />
            <button
              type="submit"
              disabled={nlLoading || !nlQuery.trim()}
              className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {nlLoading ? tr.nlThinking : tr.nlSearch}
            </button>
          </form>
          {nlSummary && (
            <div className="mt-2 flex items-center gap-2 text-sm text-blue-700" dir="auto">
              <span>✦ {nlSummary}</span>
              <button onClick={clearNlSearch} className="text-blue-500 hover:underline text-xs">{tr.nlClear}</button>
            </div>
          )}
          {!nlSummary && (
            <p className="mt-1.5 text-xs text-blue-400">{tr.nlPowered}</p>
          )}
        </div>
      </div>

      {/* Sticky filter bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-wrap gap-2">
          <input
            type="text"
            placeholder={tr.searchPlaceholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
            dir="auto"
            className="flex-1 min-w-44 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select value={make} onChange={e => { setMake(e.target.value); setModel('') }} className={selectCls}>
            <option value="">{tr.allMakes}</option>
            {makes.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {make && (
            <select value={model} onChange={e => setModel(e.target.value)} className={selectCls}>
              <option value="">{tr.allModels}</option>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          <select value={city} onChange={e => setCity(e.target.value)} className={selectCls}>
            <option value="">{tr.allCities}</option>
            {cities.map(c => <option key={c} value={c}>{cityLabel(c, lang)}</option>)}
          </select>
          <select value={maxPrice} onChange={e => setMaxPrice(e.target.value)} className={selectCls}>
            <option value="">{tr.anyPrice}</option>
            {tr.priceCaps.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={maxMileage} onChange={e => setMaxMileage(e.target.value)} className={selectCls}>
            <option value="">{tr.anyMileage}</option>
            {tr.mileageCaps.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={sort} onChange={e => setSort(e.target.value as SortKey)} className={selectCls}>
            <option value="deal_score">{tr.sortBestDeal}</option>
            <option value="price_asc">{tr.sortPriceAsc}</option>
            <option value="price_desc">{tr.sortPriceDesc}</option>
            <option value="year_desc">{tr.sortNewest}</option>
          </select>
        </div>
      </div>

      {/* Results */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-4">
          <p className="text-sm text-gray-500">{tr.listingsFound(filtered.length)}</p>
          {hasFilters && (
            <button onClick={clearFilters} className="text-sm text-blue-600 hover:underline">
              {tr.clearFilters}
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-5xl mb-4">🔍</p>
            <p className="text-lg font-medium text-gray-600">{tr.noListings}</p>
            <p className="text-sm mt-1">{tr.noListingsSub}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(listing => (
              <ListingCard key={listing.id} listing={listing} lang={lang} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
