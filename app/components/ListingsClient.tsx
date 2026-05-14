'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Listing } from '@/lib/supabase'
import { translations, cityLabel, type Lang } from '@/lib/translations'
import ListingCard from './ListingCard'
import VoiceAdvisor from './VoiceAdvisor'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

// ── Types ──────────────────────────────────────────────────────────────────────
type SortKey = 'deal_score' | 'price_asc' | 'price_desc' | 'year_desc' | 'mileage_asc'
type AIFilters = {
  make?: string; model?: string; city?: string
  maxPrice?: number; minPrice?: number; maxMileage?: number
  minYear?: number; maxYear?: number
}

// ── Geometric SVG pattern ──────────────────────────────────────────────────────
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

const ALL = '__all__'

// ── Source config ──────────────────────────────────────────────────────────────
const SOURCES = [
  {
    key: 'haraj',
    nameAr: 'حراج',
    nameEn: 'Haraj',
    logo: '/logos/haraj.svg',
    color: '#1A7DC4',
    bg: '#EFF6FF',
    border: '#93C5FD',
  },
  {
    key: 'syarah',
    nameAr: 'سيارة',
    nameEn: 'Syarah',
    logo: '/logos/syarah.svg',
    color: '#2563EB',
    bg: '#EFF6FF',
    border: '#93C5FD',
  },
  {
    key: 'motory',
    nameAr: 'موتور',
    nameEn: 'Motory',
    logo: '/logos/motory.svg',
    color: '#171D35',
    bg: '#F5F3FF',
    border: '#C4B5FD',
  },
  {
    key: 'soum',
    nameAr: 'سوم',
    nameEn: 'Soum',
    logo: '/logos/soum.svg',
    color: '#16A34A',
    bg: '#F0FDF4',
    border: '#86EFAC',
  },
  {
    key: 'gogomotor',
    nameAr: 'قوقو موتور',
    nameEn: 'GoGoMotor',
    logo: '/logos/gogomotor.svg',
    color: '#DC2626',
    bg: '#FFF1F2',
    border: '#FECACA',
  },
  {
    key: 'saudisale',
    nameAr: 'سيل',
    nameEn: 'Saudi Sale',
    logo: '/logos/saudisale.svg',
    color: '#F5A623',
    bg: '#FFFBEB',
    border: '#FCD34D',
  },
  {
    key: 'yallamotor',
    nameAr: 'يلا موتور',
    nameEn: 'Yalla Motor',
    logo: '/logos/yallamotor.svg',
    color: '#0057B8',
    bg: '#EFF6FF',
    border: '#93C5FD',
  },
  {
    key: 'carswitch',
    nameAr: 'كار سويتش',
    nameEn: 'CarSwitch',
    logo: '/logos/carswitch.svg',
    color: '#1A1A2E',
    bg: '#F1F5F9',
    border: '#CBD5E1',
  },
  {
    key: 'carly',
    nameAr: 'كارلي',
    nameEn: 'Carly',
    logo: '/logos/carly.svg',
    color: '#00B894',
    bg: '#F0FDF4',
    border: '#6EE7B7',
  },
]

// ── Container animation ────────────────────────────────────────────────────────
const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
}

// ── Wordmark ───────────────────────────────────────────────────────────────────
function SiyaraAIWordmark({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  const sizeClass = size === 'lg'
    ? 'text-4xl'
    : 'text-xl'
  return (
    <span className={`inline-flex items-baseline gap-1 leading-none ${sizeClass}`}>
      <span className="font-logo font-bold text-white tracking-wide">
        سيارة
      </span>
      <span
        className="font-bold tracking-tight"
        style={{
          fontFamily: 'var(--font-geist), Geist, sans-serif',
          fontSize: size === 'lg' ? '0.78em' : '0.82em',
          color: 'oklch(0.82 0.14 78)',
          letterSpacing: '0.04em',
        }}
      >
        AI
      </span>
    </span>
  )
}

export default function ListingsClient({ listings }: { listings: Listing[] }) {
  const [lang, setLang]   = useState<Lang>('ar')
  const tr = translations[lang]

  useEffect(() => {
    document.documentElement.dir  = lang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = lang
  }, [lang])

  // ── Filter state ──────────────────────────────────────────────────────────
  const [make,                setMake]                = useState('')
  const [model,               setModel]               = useState('')
  const [city,                setCity]                = useState('')
  const [maxPrice,            setMaxPrice]            = useState('')
  const [maxMileage,          setMaxMileage]          = useState('')
  const [sort,                setSort]                = useState<SortKey>('deal_score')
  const [source,              setSource]              = useState('')
  const [showContactForPrice, setShowContactForPrice] = useState(false)
  const [filterSheetOpen,     setFilterSheetOpen]     = useState(false)
  const [voiceOpen,           setVoiceOpen]           = useState(false)

  // AI-search state
  const [nlQuery,   setNlQuery]   = useState('')
  const [nlLoading, setNlLoading] = useState(false)
  const [nlSummary, setNlSummary] = useState('')
  const [aiFilters, setAiFilters] = useState<AIFilters>({})
  const nlInputRef = useRef<HTMLInputElement>(null)

  // Voice filter callback
  const handleVoiceFilters = useCallback((f: {
    make?: string; model?: string; city?: string
    price_max?: number; price_min?: number; mileage_max?: number
    year_min?: number; year_max?: number
  }) => {
    setAiFilters({
      make: f.make, model: f.model, city: f.city,
      maxPrice: f.price_max, minPrice: f.price_min,
      maxMileage: f.mileage_max, minYear: f.year_min, maxYear: f.year_max,
    })
    if (f.make)  setMake(f.make)
    if (f.model) setModel(f.model)
    if (f.city)  setCity(f.city)
    if (f.price_max)   setMaxPrice(String(f.price_max))
    if (f.mileage_max) setMaxMileage(String(f.mileage_max))
  }, [])

  // ── AI search ─────────────────────────────────────────────────────────────
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
      if (filters.make)  parts.push(filters.make)
      if (filters.model) parts.push(filters.model)
      if (filters.city)  parts.push(`${tr.nlIn} ${cityLabel(filters.city, lang)}`)
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
    setNlQuery(''); setAiFilters({}); setNlSummary('')
    nlInputRef.current?.focus()
  }

  // ── Derived lists for selects ──────────────────────────────────────────────
  const makes = useMemo(() =>
    [...new Set(listings.map(l => l.make_en).filter(Boolean))].sort() as string[]
  , [listings])

  const models = useMemo(() => {
    if (!make) return []
    return [...new Set(
      listings.filter(l => l.make_en === make).map(l => l.model_en).filter(Boolean)
    )].sort() as string[]
  }, [listings, make])

  const cityOptions = useMemo(() => {
    const map = new Map<string, { en: string; ar: string | null }>()
    for (const l of listings) {
      if (l.city_en && !map.has(l.city_en)) map.set(l.city_en, { en: l.city_en, ar: l.city_ar ?? null })
    }
    return [...map.values()].sort((a, b) => a.en.localeCompare(b.en))
  }, [listings])

  // ── Sort function ──────────────────────────────────────────────────────────
  const sortFn = useCallback((a: Listing, b: Listing): number => {
    if (sort === 'deal_score') {
      const aS = a.deal_score ?? (a.contact_for_price ? -2 : -1)
      const bS = b.deal_score ?? (b.contact_for_price ? -2 : -1)
      return bS - aS
    }
    if (sort === 'price_asc')  return (a.price_sar ?? Infinity) - (b.price_sar ?? Infinity)
    if (sort === 'price_desc') return (b.price_sar ?? -Infinity) - (a.price_sar ?? -Infinity)
    if (sort === 'mileage_asc') return (a.mileage_km ?? Infinity) - (b.mileage_km ?? Infinity)
    return (b.year ?? 0) - (a.year ?? 0)
  }, [sort])

  // ── Filtering ──────────────────────────────────────────────────────────────
  const { filtered, isFallback } = useMemo(() => {
    const eMake       = aiFilters.make  ?? (make  || undefined)
    const eModel      = aiFilters.model ?? (model || undefined)
    const eCity       = aiFilters.city  ?? (city  || undefined)
    const eMaxPrice   = aiFilters.maxPrice   ?? (maxPrice   ? parseInt(maxPrice)   : undefined)
    const eMaxMileage = aiFilters.maxMileage ?? (maxMileage ? parseInt(maxMileage) : undefined)

    const applyCat = (pool: Listing[]) => {
      let r = pool
      if (eMake)  r = r.filter(l => (l.make_en  ?? '').toLowerCase() === eMake!.toLowerCase())
      if (eModel) r = r.filter(l => (l.model_en ?? '').toLowerCase() === eModel!.toLowerCase())
      if (eCity)  r = r.filter(l => (l.city_en  ?? '').toLowerCase() === eCity!.toLowerCase())
      if (source) r = r.filter(l => l.source === source)
      return r
    }
    const applyNum = (pool: Listing[]) => {
      let r = pool
      if (eMaxPrice)          r = r.filter(l => l.price_sar != null && l.price_sar <= eMaxPrice!)
      if (aiFilters.minPrice) r = r.filter(l => l.price_sar != null && l.price_sar >= aiFilters.minPrice!)
      if (eMaxMileage)        r = r.filter(l => l.mileage_km == null || l.mileage_km <= eMaxMileage!)
      if (aiFilters.minYear)  r = r.filter(l => (l.year ?? 0) >= aiFilters.minYear!)
      if (aiFilters.maxYear)  r = r.filter(l => (l.year ?? 9999) <= aiFilters.maxYear!)
      return r
    }

    let base = showContactForPrice ? listings : listings.filter(l => !l.contact_for_price)
    const cat    = applyCat(base)
    const strict = applyNum(cat)

    if (strict.length > 0) return { filtered: [...strict].sort(sortFn), isFallback: false }

    const hasNum = aiFilters.maxPrice || aiFilters.minPrice || aiFilters.maxMileage ||
      aiFilters.minYear || aiFilters.maxYear || maxPrice || maxMileage
    if (hasNum && cat.length > 0) return { filtered: [...cat].sort(sortFn), isFallback: true }

    const hasAny = eMake || eModel || eCity || source
    if (hasAny && base.length > 0) return { filtered: [...base].sort(sortFn), isFallback: true }

    return { filtered: [...strict].sort(sortFn), isFallback: false }
  }, [listings, make, model, city, maxPrice, maxMileage, sort, source, aiFilters, showContactForPrice, sortFn])

  const hasFilters = make || model || city || maxPrice || maxMileage || source || Object.keys(aiFilters).length > 0
  const activeFilterCount = [make, model, city, maxPrice, maxMileage, source,
    Object.keys(aiFilters).length > 0 ? '1' : '']
    .filter(Boolean).length

  function clearFilters() {
    setMake(''); setModel(''); setCity(''); setMaxPrice(''); setMaxMileage(''); setSource('')
    clearNlSearch()
  }

  const pricedCount  = listings.filter(l => !l.contact_for_price).length
  const displayTotal = showContactForPrice ? listings.length : pricedCount

  // ── Computed display labels for filter selects ─────────────────────────────
  const sortLabel = {
    deal_score:  tr.sortBestDeal,
    price_asc:   tr.sortPriceAsc,
    price_desc:  tr.sortPriceDesc,
    year_desc:   tr.sortNewest,
    mileage_asc: tr.sortMileageAsc,
  }[sort]

  const cityLabel_ = city
    ? (cityOptions.find(c => c.en === city)
        ? cityLabel(city, lang, cityOptions.find(c => c.en === city)?.ar ?? null)
        : city)
    : ''

  const priceLabel   = maxPrice   ? tr.priceCaps.find(p => p.value === maxPrice)?.label   ?? maxPrice   : ''
  const mileageLabel = maxMileage ? tr.mileageCaps.find(p => p.value === maxMileage)?.label ?? maxMileage : ''

  // ── shadcn Select helper (renders correct label, not raw value) ────────────
  const Sel = ({
    value, onChange, placeholder, displayLabel, children, className = ''
  }: {
    value: string
    onChange: (v: string) => void
    placeholder: string
    displayLabel?: string
    children: React.ReactNode
    className?: string
  }) => {
    const isActive = Boolean(value)
    return (
      <Select value={value || ALL} onValueChange={v => onChange(v === ALL ? '' : (v ?? ''))}>
        <SelectTrigger
          className={`h-11 text-sm border-border/70 rounded-xl min-w-[130px] transition-colors ${
            isActive
              ? 'bg-primary text-primary-foreground border-primary font-semibold'
              : 'bg-white hover:bg-muted/50 text-foreground'
          } ${className}`}
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
        >
          <span className="flex-1 text-start truncate">
            {isActive && displayLabel ? displayLabel : (
              <span className={isActive ? 'text-primary-foreground' : 'text-muted-foreground'}>
                {placeholder}
              </span>
            )}
          </span>
        </SelectTrigger>
        <SelectContent dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <SelectItem value={ALL}>{placeholder}</SelectItem>
          {children}
        </SelectContent>
      </Select>
    )
  }

  const FilterControls = () => (
    <>
      <Sel value={make} onChange={v => { setMake(v); setModel('') }}
        placeholder={tr.allMakes} displayLabel={make}>
        {makes.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
      </Sel>

      {make && (
        <Sel value={model} onChange={setModel}
          placeholder={tr.allModels} displayLabel={model}>
          {models.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
        </Sel>
      )}

      <Sel value={city} onChange={setCity}
        placeholder={tr.allCities} displayLabel={cityLabel_}>
        {cityOptions.map(c => (
          <SelectItem key={c.en} value={c.en}>
            {lang === 'ar' ? (c.ar ?? c.en) : c.en}
          </SelectItem>
        ))}
      </Sel>

      <Sel value={maxPrice} onChange={setMaxPrice}
        placeholder={tr.anyPrice} displayLabel={priceLabel}>
        {tr.priceCaps.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </Sel>

      <Sel value={maxMileage} onChange={setMaxMileage}
        placeholder={tr.anyMileage} displayLabel={mileageLabel}>
        {tr.mileageCaps.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </Sel>

      <Sel value={sort} onChange={v => setSort(v as SortKey)}
        placeholder={tr.sortBestDeal} displayLabel={sortLabel}>
        <SelectItem value="deal_score">{tr.sortBestDeal}</SelectItem>
        <SelectItem value="price_asc">{tr.sortPriceAsc}</SelectItem>
        <SelectItem value="price_desc">{tr.sortPriceDesc}</SelectItem>
        <SelectItem value="mileage_asc">{tr.sortMileageAsc}</SelectItem>
        <SelectItem value="year_desc">{tr.sortNewest}</SelectItem>
      </Sel>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none whitespace-nowrap">
        <input
          type="checkbox"
          checked={showContactForPrice}
          onChange={e => setShowContactForPrice(e.target.checked)}
          className="rounded border-border"
        />
        {lang === 'ar' ? 'بدون سعر' : 'No-price'}
      </label>
    </>
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">

      {/* Voice Advisor */}
      <VoiceAdvisor
        onApplyFilters={handleVoiceFilters}
        externalOpen={voiceOpen}
        onExternalOpenHandled={() => setVoiceOpen(false)}
      />

      {/* ── Hero header ──────────────────────────────────────────────────── */}
      <header className="relative bg-gradient-to-br from-slate-900 via-blue-950 to-slate-800 px-4 pt-6 pb-10 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.055] pointer-events-none"
          style={{ backgroundImage: GEO_PATTERN, backgroundRepeat: 'repeat' }}
        />

        <div className="relative max-w-4xl mx-auto">
          {/* Logo row */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <SiyaraAIWordmark size="lg" />
              <p className="text-blue-300/70 text-xs mt-2 font-medium" style={{ fontFamily: 'var(--font-tajawal)' }}>
                {tr.subtitle}
              </p>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-blue-300/70 text-xs hidden sm:block font-medium">
                {tr.listingsIndexed(displayTotal)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLang(l => l === 'ar' ? 'en' : 'ar')}
                className="text-xs font-semibold bg-white/10 hover:bg-white/20 border-white/20 text-white rounded-xl h-8 px-3"
              >
                {tr.toggleLang}
              </Button>
            </div>
          </div>

          {/* Hero search form — 64px tall */}
          <form onSubmit={handleNlSearch}>
            <div className="flex items-stretch bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 focus-within:border-blue-400/60 transition-colors overflow-hidden" style={{ minHeight: 64 }}>
              {/* Search button */}
              <button
                type="submit"
                disabled={nlLoading || !nlQuery.trim()}
                className="shrink-0 px-6 bg-primary hover:bg-primary/90 disabled:opacity-40 text-white text-sm font-bold transition-colors"
              >
                {nlLoading ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : tr.nlSearch}
              </button>

              {/* Input */}
              <input
                ref={nlInputRef}
                type="text"
                placeholder={tr.nlPlaceholder}
                value={nlQuery}
                onChange={e => setNlQuery(e.target.value)}
                dir="auto"
                className="flex-1 bg-transparent text-white text-sm px-4 focus:outline-none placeholder:text-blue-300/50 min-w-0"
              />

              {/* Mic button */}
              <button
                type="button"
                onClick={() => setVoiceOpen(true)}
                className="shrink-0 px-5 text-blue-300 hover:text-white transition-colors flex items-center"
                aria-label="مستشار سيارة AI الصوتي"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2H3v2a9 9 0 0 0 8 8.94V23h2v-2.06A9 9 0 0 0 21 12v-2h-2z"/>
                </svg>
              </button>
            </div>
          </form>

          {/* AI summary / powered by */}
          <div className="mt-3 min-h-[20px]">
            {nlSummary ? (
              <div className="flex items-center gap-2 text-sm" dir="auto">
                <span className="text-blue-400">✦</span>
                <span className="text-blue-200 text-xs">{nlSummary}</span>
                <button onClick={clearNlSearch} className="text-blue-400 hover:text-white text-xs underline transition-colors">
                  {tr.nlClear}
                </button>
              </div>
            ) : (
              <p className="text-center text-xs text-blue-400/50">{tr.nlPowered}</p>
            )}
          </div>
        </div>
      </header>

      {/* ── Source ribbon ────────────────────────────────────────────────── */}
      <div className="border-b border-border" style={{ background: '#F8F9FA' }}>
        <div className="max-w-4xl mx-auto px-4 py-4">
          <p className="text-center text-xs font-medium text-muted-foreground mb-3">
            {lang === 'ar' ? 'نجمع لك أحسن العروض من' : 'We aggregate the best deals from'}
          </p>
          <div className="flex items-center justify-center gap-3 sm:gap-6 overflow-x-auto pb-0.5 no-scrollbar">
            {/* All sources chip */}
            <button
              onClick={() => setSource('')}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full border text-xs font-semibold transition-all ${
                !source
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-white text-muted-foreground border-border hover:border-border/80'
              }`}
            >
              {lang === 'ar' ? 'الكل' : 'All'}
            </button>

            {SOURCES.map(s => {
              const isActive = source === s.key
              return (
                <button
                  key={s.key}
                  onClick={() => setSource(isActive ? '' : s.key)}
                  className="flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-xl transition-all duration-200"
                  style={{
                    filter: isActive ? 'none' : 'grayscale(70%) opacity(0.6)',
                  }}
                  title={lang === 'ar' ? s.nameAr : s.nameEn}
                  aria-pressed={isActive}
                >
                  <div
                    className="flex items-center justify-center px-5 py-2.5 rounded-xl border transition-all duration-200"
                    style={{
                      background: isActive ? s.bg : 'white',
                      borderColor: isActive ? s.border : '#E5E7EB',
                      boxShadow: isActive ? `0 0 0 1px ${s.border}` : 'none',
                      minWidth: 100,
                      minHeight: 44,
                    }}
                  >
                    <img
                      src={s.logo}
                      alt={s.nameEn}
                      className="h-7 w-auto object-contain"
                      referrerPolicy="no-referrer"
                      draggable={false}
                    />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Sticky filter bar ─────────────────────────────────────────────── */}
      <div className="bg-white/95 backdrop-blur-sm border-b border-border sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-2.5">
          {/* Mobile */}
          <div className="flex sm:hidden items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilterSheetOpen(true)}
              className="rounded-xl text-sm font-semibold border-border/70 h-11 gap-1.5"
            >
              {lang === 'ar' ? 'فلاتر' : 'Filters'}
              {activeFilterCount > 0 && (
                <span className="bg-primary text-primary-foreground text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {activeFilterCount}
                </span>
              )}
            </Button>

            {/* Sort always visible on mobile */}
            <Sel value={sort} onChange={v => setSort(v as SortKey)}
              placeholder={tr.sortBestDeal} displayLabel={sortLabel} className="flex-1">
              <SelectItem value="deal_score">{tr.sortBestDeal}</SelectItem>
              <SelectItem value="price_asc">{tr.sortPriceAsc}</SelectItem>
              <SelectItem value="price_desc">{tr.sortPriceDesc}</SelectItem>
              <SelectItem value="mileage_asc">{tr.sortMileageAsc}</SelectItem>
              <SelectItem value="year_desc">{tr.sortNewest}</SelectItem>
            </Sel>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-destructive h-11 text-xs px-2 shrink-0">
                {lang === 'ar' ? 'مسح' : 'Clear'}
              </Button>
            )}
          </div>

          {/* Desktop */}
          <div className="hidden sm:flex flex-wrap items-center gap-2">
            <FilterControls />
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-destructive hover:text-destructive h-11 text-xs rounded-xl ms-1"
              >
                {tr.clearFilters}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Mobile filter Sheet ───────────────────────────────────────────── */}
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl max-h-[80vh] overflow-y-auto"
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
        >
          <SheetHeader className="mb-4">
            <SheetTitle>{lang === 'ar' ? 'الفلاتر' : 'Filters'}</SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-3 pb-8">
            <FilterControls />

            <div className="flex gap-2 pt-2">
              {hasFilters && (
                <Button
                  variant="outline"
                  className="flex-1 border-destructive text-destructive hover:bg-destructive/5"
                  onClick={() => { clearFilters(); setFilterSheetOpen(false) }}
                >
                  {tr.clearFilters}
                </Button>
              )}
              <Button
                className="flex-1 bg-primary text-primary-foreground"
                onClick={() => setFilterSheetOpen(false)}
              >
                {lang === 'ar'
                  ? `عرض ${filtered.length.toLocaleString()} نتيجة`
                  : `Show ${filtered.length.toLocaleString()} results`}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Results ───────────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Fallback notice */}
        <AnimatePresence>
          {isFallback && (
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mb-5 flex items-start gap-2.5 bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3 rounded-xl"
            >
              <span className="text-base mt-0.5">⚠️</span>
              <span className="font-medium">{tr.noExactMatch}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results count */}
        <div className="flex items-center gap-3 mb-5">
          <p className="text-sm font-semibold text-muted-foreground">
            {tr.listingsFound(filtered.length)}
          </p>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="text-xs text-primary h-7 px-2 rounded-full bg-primary/8 hover:bg-primary/15"
            >
              {tr.clearFilters} ✕
            </Button>
          )}
        </div>

        {/* Empty state */}
        {filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0015.803 15.803z"/>
              </svg>
            </div>
            <p className="text-base font-bold text-foreground mb-1">{tr.noListings}</p>
            <p className="text-sm text-muted-foreground">{tr.noListingsSub}</p>
            {hasFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4 rounded-xl">
                {tr.clearFilters}
              </Button>
            )}
          </motion.div>
        ) : (
          <motion.div
            variants={container}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          >
            {filtered.map((listing, i) => (
              <ListingCard key={listing.id} listing={listing} lang={lang} index={i} />
            ))}
          </motion.div>
        )}
      </main>
    </div>
  )
}
