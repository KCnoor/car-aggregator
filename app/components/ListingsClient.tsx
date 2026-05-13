'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import type { Listing } from '@/lib/supabase'
import { translations, cityLabel, type Lang } from '@/lib/translations'
import ListingCard from './ListingCard'

type SortKey = 'deal_score' | 'price_asc' | 'price_desc' | 'year_desc' | 'mileage_asc'

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

// Saudi-inspired geometric watermark pattern (nested diamonds + cardinal dots)
const GEO_PATTERN = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56">' +
  '<path d="M28 3 L53 28 L28 53 L3 28 Z" fill="none" stroke="white" stroke-width="0.7"/>' +
  '<path d="M28 15 L41 28 L28 41 L15 28 Z" fill="none" stroke="white" stroke-width="0.7"/>' +
  '<circle cx="28" cy="3"  r="1.4" fill="white"/>' +
  '<circle cx="53" cy="28" r="1.4" fill="white"/>' +
  '<circle cx="28" cy="53" r="1.4" fill="white"/>' +
  '<circle cx="3"  cy="28" r="1.4" fill="white"/>' +
  '<circle cx="28" cy="28" r="2"   fill="white"/>' +
  '</svg>'
)}")`

export default function ListingsClient({ listings }: { listings: Listing[] }) {
  const [lang, setLang] = useState<Lang>('ar')
  const tr = translations[lang]

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = lang
  }, [lang])

  const [make, setMake]           = useState('')
  const [model, setModel]         = useState('')
  const [city, setCity]           = useState('')
  const [maxPrice, setMaxPrice]   = useState('')
  const [maxMileage, setMaxMileage] = useState('')
  const [sort, setSort]           = useState<SortKey>('deal_score')
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)

  const [nlQuery, setNlQuery]     = useState('')
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
      const { filters, sort: aiSort } = await res.json() as { filters: AIFilters; sort: string | null }
      setAiFilters(filters)
      if (aiSort) setSort(aiSort as SortKey)
      setMake(''); setModel(''); setCity(''); setMaxPrice(''); setMaxMileage('')
      const parts: string[] = []
      if (filters.make) parts.push(filters.make)
      if (filters.model) parts.push(filters.model)
      if (filters.city) parts.push(`${tr.nlIn} ${cityLabel(filters.city, lang)}`)
      if (filters.minYear && filters.maxYear && filters.minYear === filters.maxYear) {
        parts.push(`${tr.nlYear} ${filters.minYear}`)
      } else if (filters.minYear) {
        parts.push(`${tr.nlFrom} ${filters.minYear}`)
      }
      if (filters.maxPrice)   parts.push(`${tr.nlUnderPrice} ${filters.maxPrice.toLocaleString()} ${tr.sar}`)
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

  const makes  = useMemo(() => [...new Set(listings.map(l => l.make))].sort(), [listings])
  const models = useMemo(() => {
    if (!make) return []
    return [...new Set(listings.filter(l => l.make === make).map(l => l.model))].sort()
  }, [listings, make])
  const cities = useMemo(() => [...new Set(listings.map(l => l.city))].sort(), [listings])

  const { filtered, isFallback } = useMemo(() => {
    const sortFn = (a: Listing, b: Listing) => {
      if (sort === 'deal_score')  return (b.deal_score ?? 0) - (a.deal_score ?? 0)
      if (sort === 'price_asc')   return a.price - b.price
      if (sort === 'price_desc')  return b.price - a.price
      if (sort === 'mileage_asc') return (a.mileage ?? Infinity) - (b.mileage ?? Infinity)
      return b.year - a.year
    }

    const effectiveMake  = aiFilters.make  ?? (make  || undefined)
    const effectiveModel = aiFilters.model ?? (model || undefined)
    const effectiveCity  = aiFilters.city  ?? (city  || undefined)
    const effectiveMaxPrice   = aiFilters.maxPrice   ?? (maxPrice   ? parseInt(maxPrice)   : undefined)
    const effectiveMaxMileage = aiFilters.maxMileage ?? (maxMileage ? parseInt(maxMileage) : undefined)

    const applyCategorical = (pool: Listing[]) => {
      let r = pool
      if (effectiveMake)  r = r.filter(l => l.make.toLowerCase()  === effectiveMake!.toLowerCase())
      if (effectiveModel) r = r.filter(l => l.model.toLowerCase() === effectiveModel!.toLowerCase())
      if (effectiveCity)  r = r.filter(l => l.city === effectiveCity)
      return r
    }
    const applyNumeric = (pool: Listing[]) => {
      let r = pool
      if (effectiveMaxPrice)   r = r.filter(l => l.price <= effectiveMaxPrice!)
      if (aiFilters.minPrice)  r = r.filter(l => l.price >= aiFilters.minPrice!)
      if (effectiveMaxMileage) r = r.filter(l => l.mileage == null || l.mileage <= effectiveMaxMileage!)
      if (aiFilters.minYear)   r = r.filter(l => l.year >= aiFilters.minYear!)
      if (aiFilters.maxYear)   r = r.filter(l => l.year <= aiFilters.maxYear!)
      return r
    }

    const categorical = applyCategorical(listings)
    const strict      = applyNumeric(categorical)

    if (strict.length > 0) return { filtered: [...strict].sort(sortFn), isFallback: false }

    // Relax numeric constraints, keep categorical
    const hasNumeric = aiFilters.maxPrice || aiFilters.minPrice || aiFilters.maxMileage || aiFilters.minYear || aiFilters.maxYear || maxPrice || maxMileage
    if (hasNumeric && categorical.length > 0) {
      return { filtered: [...categorical].sort(sortFn), isFallback: true }
    }

    // Relax everything — show all listings sorted by deal score as closest
    const hasAnyFilter = effectiveMake || effectiveModel || effectiveCity
    if (hasAnyFilter && listings.length > 0) {
      return { filtered: [...listings].sort((a, b) => (b.deal_score ?? 0) - (a.deal_score ?? 0)), isFallback: true }
    }

    return { filtered: [...strict].sort(sortFn), isFallback: false }
  }, [listings, make, model, city, maxPrice, maxMileage, sort, aiFilters])

  const hasFilters = make || model || city || maxPrice || maxMileage || Object.keys(aiFilters).length > 0

  const activeFilterCount = useMemo(() =>
    [make, model, city, maxPrice, maxMileage, Object.keys(aiFilters).length > 0 ? '1' : ''].filter(Boolean).length,
    [make, model, city, maxPrice, maxMileage, aiFilters]
  )

  function clearFilters() {
    setMake(''); setModel(''); setCity(''); setMaxPrice(''); setMaxMileage('')
    clearNlSearch()
  }

  const selectCls = 'border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 w-full sm:w-auto'

  const FilterControls = () => (
    <>
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
        <option value="mileage_asc">{tr.sortMileageAsc}</option>
        <option value="year_desc">{tr.sortNewest}</option>
      </select>
    </>
  )

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Hero header */}
      <header className="relative bg-gradient-to-br from-slate-900 via-blue-950 to-slate-800 px-4 pt-5 pb-8 overflow-hidden">
        {/* Geometric watermark */}
        <div
          className="absolute inset-0 opacity-[0.055] pointer-events-none"
          style={{ backgroundImage: GEO_PATTERN, backgroundRepeat: 'repeat' }}
        />

        <div className="relative max-w-4xl mx-auto">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-7">
            <div>
              <h1 className="font-logo text-3xl font-bold text-white tracking-wide">{tr.title}</h1>
              <p className="text-blue-400 text-xs mt-0.5">{tr.subtitle}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-blue-400 text-xs hidden sm:block">{tr.listingsIndexed(listings.length)}</span>
              <button
                onClick={() => setLang(l => l === 'ar' ? 'en' : 'ar')}
                className="text-xs font-semibold bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-lg px-3 py-1.5 transition-colors"
              >
                {tr.toggleLang}
              </button>
            </div>
          </div>

          {/* AI search */}
          <form onSubmit={handleNlSearch} className="flex gap-2 bg-white/10 backdrop-blur-sm p-1.5 rounded-2xl border border-white/20 focus-within:border-blue-400/50 transition-colors">
            <input
              ref={nlInputRef}
              type="text"
              placeholder={tr.nlPlaceholder}
              value={nlQuery}
              onChange={e => setNlQuery(e.target.value)}
              dir="auto"
              className="flex-1 bg-transparent text-white text-sm px-3 py-2 focus:outline-none placeholder:text-blue-300/60 min-w-0"
            />
            <button
              type="submit"
              disabled={nlLoading || !nlQuery.trim()}
              className="shrink-0 px-5 py-2 bg-blue-500 hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors"
            >
              {nlLoading ? tr.nlThinking : tr.nlSearch}
            </button>
          </form>

          {nlSummary ? (
            <div className="mt-3 flex items-center gap-2 text-sm" dir="auto">
              <span className="text-blue-400">✦</span>
              <span className="text-blue-200">{nlSummary}</span>
              <button onClick={clearNlSearch} className="text-blue-400 hover:text-white text-xs underline transition-colors">
                {tr.nlClear}
              </button>
            </div>
          ) : (
            <p className="mt-2.5 text-center text-xs text-blue-400/60">{tr.nlPowered}</p>
          )}
        </div>
      </header>

      {/* Sticky filter bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10 shadow-md">
        <div className="max-w-7xl mx-auto">
          {/* Mobile: filter button */}
          <div className="flex sm:hidden items-center gap-2">
            <button
              onClick={() => setFilterSheetOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors shrink-0"
            >
              {lang === 'ar' ? 'فلاتر' : 'Filters'}
              {activeFilterCount > 0 && (
                <span className="bg-blue-600 text-white text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Desktop: all filters inline */}
          <div className="hidden sm:flex flex-wrap gap-2">
            <FilterControls />
          </div>
        </div>
      </div>

      {/* Mobile bottom sheet backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 sm:hidden transition-opacity duration-300 ${filterSheetOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setFilterSheetOpen(false)}
      />

      {/* Mobile bottom sheet */}
      <div className={`fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 sm:hidden transition-transform duration-300 ease-out ${filterSheetOpen ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-base font-bold text-gray-900">
            {lang === 'ar' ? 'الفلاتر' : 'Filters'}
          </h3>
          <button
            onClick={() => setFilterSheetOpen(false)}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none transition-colors"
          >
            ✕
          </button>
        </div>
        {/* drag handle */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 bg-gray-200 rounded-full" />

        <div className="px-5 pb-2 flex flex-col gap-2.5 overflow-y-auto max-h-[65vh]">
          <FilterControls />
        </div>

        <div className="px-5 pt-3 pb-8 border-t border-gray-100 flex gap-2">
          {hasFilters && (
            <button
              onClick={() => { clearFilters(); setFilterSheetOpen(false) }}
              className="flex-1 py-2.5 text-sm font-semibold text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-colors"
            >
              {tr.clearFilters}
            </button>
          )}
          <button
            onClick={() => setFilterSheetOpen(false)}
            className="flex-1 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
          >
            {lang === 'ar' ? `عرض ${filtered.length} نتيجة` : `Show ${filtered.length} results`}
          </button>
        </div>
      </div>

      {/* Results */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {isFallback && (
          <div className="mb-5 flex items-start gap-2.5 bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3 rounded-xl">
            <span className="text-base mt-0.5">⚠️</span>
            <span className="font-medium">{tr.noExactMatch}</span>
          </div>
        )}

        <div className="flex items-center gap-3 mb-5">
          <p className="text-sm font-medium text-gray-500">{tr.listingsFound(filtered.length)}</p>
          {hasFilters && (
            <button onClick={clearFilters} className="text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-full transition-colors">
              {tr.clearFilters}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(listing => (
            <ListingCard key={listing.id} listing={listing} lang={lang} />
          ))}
        </div>
      </main>
    </div>
  )
}
