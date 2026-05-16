'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSearchParams } from 'next/navigation'
import type { Listing } from '@/lib/supabase'
import { translations, cityLabel, type Lang } from '@/lib/translations'
import ListingCard from './ListingCard'
import { useLang } from './LangContext'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'

// ── Types ──────────────────────────────────────────────────────────────────────
type SortKey = 'deal_score' | 'price_asc' | 'price_desc' | 'year_desc' | 'mileage_asc'
type AIFilters = {
  make?: string; model?: string; city?: string
  maxPrice?: number; minPrice?: number; maxMileage?: number
  minYear?: number; maxYear?: number
}

// ── Constants ──────────────────────────────────────────────────────────────────
const HERO_BG = '#0A1628'
const AMBER   = '#D4A574'
const INITIAL = 60
const PAGE    = 40
const ALL     = '__all__'

const YEARS = Array.from({ length: 2026 - 2005 + 1 }, (_, i) => String(2026 - i))

const BODY_AR: Record<string, string> = {
  sedan: 'سيدان', suv: 'SUV', pickup: 'بيك آب',
  coupe: 'كوبيه', hatchback: 'هاتشباك', minivan: 'ميني فان',
}
const BODY_EN: Record<string, string> = {
  sedan: 'Sedan', suv: 'SUV', pickup: 'Pickup',
  coupe: 'Coupe', hatchback: 'Hatchback', minivan: 'Minivan',
}
const TRANS_AR: Record<string, string> = { automatic: 'أوتوماتيك', manual: 'يدوي' }
const TRANS_EN: Record<string, string> = { automatic: 'Automatic', manual: 'Manual' }
const FUEL_AR: Record<string, string>  = {
  petrol: 'بنزين', diesel: 'ديزل', hybrid: 'هجين',
  'mild-hybrid': 'هجين خفيف', electric: 'كهربائي',
}
const FUEL_EN: Record<string, string>  = {
  petrol: 'Petrol', diesel: 'Diesel', hybrid: 'Hybrid',
  'mild-hybrid': 'Mild Hybrid', electric: 'Electric',
}
const COND_AR: Record<string, string>  = { used: 'مستعمل', new: 'جديد' }
const COND_EN: Record<string, string>  = { used: 'Used', new: 'New' }

const VALID_TRANS = ['automatic', 'manual']

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

// ── Source config ──────────────────────────────────────────────────────────────
const SOURCES = [
  { key: 'syarah',     nameAr: 'سيارة',      nameEn: 'Syarah',      logo: '/source-logos/syarah.svg' },
  { key: 'soum',       nameAr: 'سوم',        nameEn: 'Soum',        logo: '/source-logos/soum.svg' },
  { key: 'carswitch',  nameAr: 'كار سويتش',  nameEn: 'CarSwitch',   logo: '/source-logos/carswitch.webp' },
  { key: 'digitalcar', nameAr: 'ديجيتال كار',nameEn: 'DigitalCar',  logo: '/source-logos/digitalcar.png' },
  { key: 'motory',     nameAr: 'موتري',      nameEn: 'Motory',      logo: '/source-logos/motory.svg' },
  { key: 'yallamotor', nameAr: 'يلا موتور', nameEn: 'Yalla Motor', logo: '/source-logos/yallamotor.svg' },
  { key: 'gogomotor',  nameAr: 'قوقو موتور', nameEn: 'GoGoMotor',   logo: '/source-logos/gogomotor.svg' },
  { key: 'saudisale',  nameAr: 'سعودي سيل', nameEn: 'Saudi Sale',  logo: '/source-logos/saudisale.svg' },
  { key: 'dubizzle',   nameAr: 'دوبيزل',     nameEn: 'Dubizzle',    logo: '/source-logos/dubizzle.svg' },
  { key: 'haraj',      nameAr: 'حراج',      nameEn: 'Haraj',       logo: '/source-logos/haraj.svg' },
  { key: 'carly',      nameAr: 'كارلي',      nameEn: 'Carly',       logo: '/source-logos/carly.svg' },
]

const container = { hidden: {}, visible: { transition: { staggerChildren: 0.03 } } }

// ── Live counter ──────────────────────────────────────────────────────────────
// Subtle fluctuation around the real count: every ~9s during an active cycle
// we step ±1, capped to ±3 from the real value. The cycle runs for 30s, then
// the counter rests on the real value for 60s before the next cycle. The
// fluctuation signals "system is alive" without ever showing a number far
// from reality — max delta is ±3 listings.
// LiveCounter and SiyaraAIWordmark previously lived here. Both now live in
// StickyHeader at the top of the (modes) layout — there is no second copy.

// ── Main component ─────────────────────────────────────────────────────────────
// Minimum active-listing count for a source to appear in the ribbon.
// Below this, the source looks under-curated / broken and is hidden until
// the scraper catches up. Same threshold for every source so we don't
// special-case anything.
// Threshold (active rows) below which a source is hidden from the ribbon —
// the ribbon is the credibility statement, and a brand with too-few
// listings makes it look weak. The source's listings still appear in search
// results; only the visual ribbon entry is suppressed until the source is
// meaningful. DigitalCar sits ~100 today (parser is partially broken) so it
// won't show until the scraper catches up past 500.
const MIN_LISTINGS_FOR_RIBBON = 500

type CanonicalMake = {
  canonical_make_slug: string
  canonical_name_en: string
  canonical_name_ar: string
}
type CanonicalModel = {
  canonical_make_slug: string
  canonical_model_slug: string
  canonical_name_en: string
  canonical_name_ar: string
}

export default function ListingsClient({
  listings,
  totalCount,
  newDealsCount = 0,
  newDealsSinceIso,
  sourceCounts = {},
  canonicalMakes = [],
  canonicalModels = [],
}: {
  listings: Listing[]
  totalCount: number
  newDealsCount?: number
  newDealsSinceIso?: string
  sourceCounts?: Record<string, number>
  canonicalMakes?: CanonicalMake[]
  canonicalModels?: CanonicalModel[]
}) {
  // Language is owned by LangContext now (read/write happens in StickyHeader).
  // ListingsClient stays read-only — toggling the locale anywhere updates it
  // here without prop drilling.
  const { lang } = useLang()
  const tr = translations[lang]
  const [newDealsOnly, setNewDealsOnly] = useState(false)

  // ── Filter state ──────────────────────────────────────────────────────────
  const [make,         setMake]         = useState('')
  const [model,        setModel]        = useState('')
  const [yearFrom,     setYearFrom]     = useState('')
  const [yearTo,       setYearTo]       = useState('')
  const [maxPrice,     setMaxPrice]     = useState('')
  const [maxMileage,   setMaxMileage]   = useState('')
  const [city,         setCity]         = useState('')
  const [bodyType,     setBodyType]     = useState('')
  const [transmission, setTransmission] = useState('')
  const [fuel,         setFuel]         = useState('')
  const [condition,    setCondition]    = useState('')
  const [source,       setSource]       = useState('')
  const [showContactForPrice, setShowContactForPrice] = useState(false)

  // AI-search state. The search input itself lives in <StickyHeader> now;
  // this page reads the ?q URL param it sets and dispatches the existing
  // /api/search pipeline. ?new24h=1 toggles the new-deals-today filter.
  const [nlSummary, setNlSummary] = useState('')
  const [aiFilters, setAiFilters] = useState<AIFilters>({})
  const lastAppliedQ = useRef<string>('')

  // Infinite scroll
  const [displayCount, setDisplayCount] = useState(INITIAL)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const searchParams = useSearchParams()

  async function runSearch (query: string) {
    if (!query.trim()) return
    setNlSummary('')
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const { filters, sort: aiSort } = await res.json() as { filters: AIFilters; sort: string | null }
      setAiFilters(filters)
      if (aiSort) setSort(aiSort as SortKey)
      setMake(''); setModel(''); setCity(''); setMaxPrice(''); setMaxMileage('')
      const parts: string[] = []
      if (filters.make)       parts.push(filters.make)
      if (filters.model)      parts.push(filters.model)
      if (filters.city)       parts.push(`${tr.nlIn} ${cityLabel(filters.city, lang)}`)
      if (filters.maxPrice)   parts.push(`${tr.nlUnderPrice} ${filters.maxPrice.toLocaleString()} ${tr.sar}`)
      if (filters.maxMileage) parts.push(`${tr.nlUnderMileage} ${filters.maxMileage.toLocaleString()} ${tr.km}`)
      setNlSummary(parts.length ? `${tr.nlShowing} ${parts.join(tr.separator)}` : tr.nlNoFilters)
    } catch {
      setNlSummary(tr.nlError)
    }
  }

  function clearNlSearch () { setAiFilters({}); setNlSummary('') }

  // Sync ?q + ?new24h from the URL into in-page state. The header search
  // pushes ?q=…; the live counter green pill pushes ?new24h=1.
  useEffect(() => {
    const q = searchParams.get('q') ?? ''
    const trimmed = q.trim()
    if (trimmed && trimmed !== lastAppliedQ.current) {
      lastAppliedQ.current = trimmed
      runSearch(trimmed)
    } else if (!trimmed && lastAppliedQ.current) {
      lastAppliedQ.current = ''
      clearNlSearch()
    }
    if (searchParams.get('new24h') === '1' && !newDealsOnly) setNewDealsOnly(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // ── Derived lists ──────────────────────────────────────────────────────────
  // Filter dropdowns are driven by canonical_makes / canonical_models. We
  // emit {value, label} pairs where value is always the canonical English
  // name (matched against listings.make_en by the existing filter predicate)
  // and label is the lang-appropriate canonical name shown to the user.
  // Falls back to scraped-from-listings distincts when the canonical tables
  // haven't been seeded yet, so the UI still renders pre-migration.
  type Option = { value: string; label: string }

  const makes: Option[] = useMemo(() => {
    if (canonicalMakes.length) {
      // Restrict to makes actually present in the corpus to avoid surfacing
      // 80 catalogue entries when only 40 have listings.
      const present = new Set(listings.map(l => l.make_en).filter(Boolean) as string[])
      return canonicalMakes
        .filter(m => present.has(m.canonical_name_en))
        .map(m => ({
          value: m.canonical_name_en,
          label: lang === 'ar' ? m.canonical_name_ar : m.canonical_name_en,
        }))
    }
    return [...new Set(listings.map(l => l.make_en).filter(Boolean) as string[])]
      .sort()
      .map(s => ({ value: s, label: s }))
  }, [canonicalMakes, listings, lang])

  const models: Option[] = useMemo(() => {
    if (canonicalModels.length && make) {
      const selected = canonicalMakes.find(m => m.canonical_name_en === make)
      if (selected) {
        const present = new Set(
          listings
            .filter(l => l.make_en === selected.canonical_name_en)
            .map(l => l.model_en).filter(Boolean) as string[]
        )
        return canonicalModels
          .filter(cm =>
            cm.canonical_make_slug === selected.canonical_make_slug &&
            present.has(cm.canonical_name_en))
          .map(cm => ({
            value: cm.canonical_name_en,
            label: lang === 'ar' ? cm.canonical_name_ar : cm.canonical_name_en,
          }))
      }
    }
    if (make) {
      return [...new Set(
        listings.filter(l => l.make_en === make).map(l => l.model_en).filter(Boolean) as string[]
      )].sort().map(s => ({ value: s, label: s }))
    }
    // No make selected: top 30 by frequency across all makes (legacy fallback).
    const cnt = new Map<string, number>()
    for (const l of listings) {
      if (l.model_en) cnt.set(l.model_en, (cnt.get(l.model_en) ?? 0) + 1)
    }
    return [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([m]) => ({ value: m, label: m }))
  }, [canonicalModels, canonicalMakes, listings, make, lang])

  const cityOptions = useMemo(() => {
    const map = new Map<string, { en: string; ar: string | null }>()
    for (const l of listings) {
      if (l.city_en && !map.has(l.city_en)) map.set(l.city_en, { en: l.city_en, ar: l.city_ar ?? null })
    }
    return [...map.values()].sort((a, b) => a.en.localeCompare(b.en))
  }, [listings])

  const bodyTypes = useMemo(() =>
    [...new Set(listings.map(l => l.body_type_slug).filter(Boolean))].sort() as string[]
  , [listings])

  const fuelTypes = useMemo(() =>
    [...new Set(listings.map(l => l.fuel_type_slug).filter(Boolean))].sort() as string[]
  , [listings])

  const conditions = useMemo(() =>
    [...new Set(listings.map(l => l.condition).filter(Boolean))].sort() as string[]
  , [listings])

  // ── Sort ──────────────────────────────────────────────────────────────────
  const [sort, setSort] = useState<SortKey>('deal_score')

  // ── "كل الفلاتر" drawer ──────────────────────────────────────────────────
  const [filtersOpen, setFiltersOpen] = useState(false)
  // Count of secondary filters currently set — shown as a coral pill on the
  // drawer button so users can see at a glance that there are hidden
  // constraints affecting their results.
  const drawerActiveCount = [bodyType, transmission, fuel, condition, source, maxMileage]
    .filter(Boolean).length

  const sortFn = useCallback((a: Listing, b: Listing): number => {
    if (sort === 'deal_score') {
      const aS = a.deal_score ?? (a.contact_for_price ? -2 : -1)
      const bS = b.deal_score ?? (b.contact_for_price ? -2 : -1)
      return bS - aS
    }
    if (sort === 'price_asc')   return (a.price_sar ?? Infinity) - (b.price_sar ?? Infinity)
    if (sort === 'price_desc')  return (b.price_sar ?? -Infinity) - (a.price_sar ?? -Infinity)
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
      if (eMake)        r = r.filter(l => (l.make_en  ?? '').toLowerCase() === eMake!.toLowerCase())
      if (eModel)       r = r.filter(l => (l.model_en ?? '').toLowerCase() === eModel!.toLowerCase())
      if (eCity)        r = r.filter(l => (l.city_en  ?? '').toLowerCase() === eCity!.toLowerCase())
      if (source)       r = r.filter(l => l.source === source)
      if (bodyType)     r = r.filter(l => l.body_type_slug === bodyType)
      if (transmission) r = r.filter(l => l.transmission_slug === transmission)
      if (fuel)         r = r.filter(l => l.fuel_type_slug === fuel)
      if (condition)    r = r.filter(l => l.condition === condition)
      return r
    }
    const applyNum = (pool: Listing[]) => {
      let r = pool
      if (eMaxPrice)          r = r.filter(l => l.price_sar != null && l.price_sar <= eMaxPrice!)
      if (aiFilters.minPrice) r = r.filter(l => l.price_sar != null && l.price_sar >= aiFilters.minPrice!)
      if (eMaxMileage)        r = r.filter(l => l.mileage_km == null || l.mileage_km <= eMaxMileage!)
      if (yearFrom)           r = r.filter(l => (l.year ?? 0) >= parseInt(yearFrom))
      if (yearTo)             r = r.filter(l => (l.year ?? 9999) <= parseInt(yearTo))
      if (aiFilters.minYear)  r = r.filter(l => (l.year ?? 0) >= aiFilters.minYear!)
      if (aiFilters.maxYear)  r = r.filter(l => (l.year ?? 9999) <= aiFilters.maxYear!)
      return r
    }

    let base = showContactForPrice ? listings : listings.filter(l => !l.contact_for_price)
    if (newDealsOnly && newDealsSinceIso) {
      base = base.filter(l => l.first_seen_at != null && l.first_seen_at >= newDealsSinceIso)
    }
    const cat    = applyCat(base)
    const strict = applyNum(cat)

    if (strict.length > 0) return { filtered: [...strict].sort(sortFn), isFallback: false }

    const hasNum = aiFilters.maxPrice || aiFilters.minPrice || aiFilters.maxMileage ||
      aiFilters.minYear || aiFilters.maxYear || maxPrice || maxMileage || yearFrom || yearTo
    if (hasNum && cat.length > 0) return { filtered: [...cat].sort(sortFn), isFallback: true }

    const hasAny = eMake || eModel || eCity || source || bodyType || transmission || fuel || condition
    if (hasAny && base.length > 0) return { filtered: [...base].sort(sortFn), isFallback: true }

    return { filtered: [...strict].sort(sortFn), isFallback: false }
  }, [listings, make, model, city, maxPrice, maxMileage, sort, source,
      aiFilters, showContactForPrice, sortFn,
      yearFrom, yearTo, bodyType, transmission, fuel, condition,
      newDealsOnly, newDealsSinceIso])

  useEffect(() => { setDisplayCount(INITIAL) }, [filtered])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) setDisplayCount(c => Math.min(c + PAGE, filtered.length)) },
      { rootMargin: '300px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [filtered.length])

  // ── Active chips ──────────────────────────────────────────────────────────
  const cityLabel_ = city
    ? cityLabel(city, lang, cityOptions.find(c => c.en === city)?.ar ?? null)
    : ''
  const priceLabel   = maxPrice   ? tr.priceCaps.find(p => p.value === maxPrice)?.label   ?? maxPrice   : ''
  const mileageLabel = maxMileage ? tr.mileageCaps.find(p => p.value === maxMileage)?.label ?? maxMileage : ''
  const bodyLabel    = bodyType     ? (lang === 'ar' ? BODY_AR[bodyType]   : BODY_EN[bodyType])   ?? bodyType     : ''
  const transLabel   = transmission ? (lang === 'ar' ? TRANS_AR[transmission] : TRANS_EN[transmission]) ?? transmission : ''
  const fuelLabel    = fuel         ? (lang === 'ar' ? FUEL_AR[fuel]       : FUEL_EN[fuel])       ?? fuel         : ''
  const condLabel    = condition    ? (lang === 'ar' ? COND_AR[condition]  : COND_EN[condition])  ?? condition    : ''
  const yearChipLabel = yearFrom && yearTo ? `${yearFrom} – ${yearTo}`
    : yearFrom ? `${lang === 'ar' ? 'من' : 'from'} ${yearFrom}`
    : yearTo   ? `${lang === 'ar' ? 'حتى' : 'to'} ${yearTo}` : ''

  type Chip = { label: string; clear: () => void }
  const activeChips: Chip[] = [
    make         && { label: make,       clear: () => { setMake(''); setModel('') } },
    model        && { label: model,      clear: () => setModel('') },
    yearChipLabel && { label: yearChipLabel, clear: () => { setYearFrom(''); setYearTo('') } },
    priceLabel   && { label: priceLabel, clear: () => setMaxPrice('') },
    mileageLabel && { label: mileageLabel, clear: () => setMaxMileage('') },
    cityLabel_   && { label: cityLabel_, clear: () => setCity('') },
    bodyLabel    && { label: bodyLabel,  clear: () => setBodyType('') },
    transLabel   && { label: transLabel, clear: () => setTransmission('') },
    fuelLabel    && { label: fuelLabel,  clear: () => setFuel('') },
    condLabel    && { label: condLabel,  clear: () => setCondition('') },
    source       && { label: SOURCES.find(s => s.key === source)?.[lang === 'ar' ? 'nameAr' : 'nameEn'] ?? source, clear: () => setSource('') },
    Object.keys(aiFilters).length > 0 && { label: lang === 'ar' ? 'بحث ذكي' : 'AI search', clear: clearNlSearch },
  ].filter(Boolean) as Chip[]

  const hasFilters = activeChips.length > 0

  function clearFilters() {
    setMake(''); setModel(''); setCity(''); setMaxPrice(''); setMaxMileage('')
    setSource(''); setYearFrom(''); setYearTo('')
    setBodyType(''); setTransmission(''); setFuel(''); setCondition('')
    clearNlSearch()
  }

  const sortLabel = {
    deal_score: tr.sortBestDeal, price_asc: tr.sortPriceAsc,
    price_desc: tr.sortPriceDesc, year_desc: tr.sortNewest, mileage_asc: tr.sortMileageAsc,
  }[sort]

  // ── Select helper ──────────────────────────────────────────────────────────
  const Sel = ({
    value, onChange, placeholder, activeLabel, children, minW = 108,
  }: {
    value: string; onChange: (v: string) => void
    placeholder: string; activeLabel?: string
    children: React.ReactNode; minW?: number
  }) => {
    const isActive = Boolean(value)
    return (
      <Select value={value || ALL} onValueChange={v => onChange(v === ALL ? '' : (v ?? ''))}>
        <SelectTrigger
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
          className="h-8 text-xs rounded-full border flex-shrink-0 transition-colors"
          style={{
            minWidth: minW,
            background: isActive ? 'rgba(255,107,74,0.10)' : 'var(--bg-card)',
            borderColor:    isActive ? 'var(--accent-primary)' : 'var(--hairline)',
            color:          isActive ? 'var(--accent-primary)' : 'var(--text-primary)',
            fontWeight:     isActive ? 600 : 500,
          }}
        >
          <span className="truncate text-start">
            {isActive && activeLabel ? activeLabel : (
              <span className={isActive ? '' : 'text-muted-foreground'}>{placeholder}</span>
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-page)' }}>
      {/* Search bar + microphone removed from this page — search now lives
          in the global StickyHeader, and the voice concierge UI has been
          retired (the /api/voice/* backend stays for future use). */}

      {/* AI search summary (rendered only while a query is active). */}
      {nlSummary && (
        <div className="max-w-screen-xl mx-auto px-4 pt-3">
          <div
            className="flex items-center justify-center gap-2"
            dir="auto"
          >
            <span style={{ color: 'var(--accent-primary)' }}>✦</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{nlSummary}</span>
            <button
              onClick={clearNlSearch}
              className="text-[12px] underline"
              style={{ color: 'var(--accent-primary)' }}
            >
              {tr.nlClear}
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        {/* ── Source ribbon — white-card row on the page surface ── */}
        <div className="border-t" style={{ borderColor: 'var(--hairline)', background: 'transparent' }}>
          <div className="max-w-screen-xl mx-auto px-4 py-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar">
            {/* All pill — coral when active */}
            <button
              onClick={() => setSource('')}
              className="flex-shrink-0 h-7 px-3.5 rounded-full border text-[11px] font-semibold transition-all whitespace-nowrap"
              style={!source
                ? { background: 'var(--accent-primary)', color: '#FFFFFF', borderColor: 'var(--accent-primary)' }
                : { background: 'var(--bg-card)', color: 'var(--text-secondary)', borderColor: 'var(--hairline)' }
              }
            >
              {lang === 'ar' ? 'الكل' : 'All'}
            </button>

            {SOURCES.filter(s => (sourceCounts[s.key] ?? Infinity) >= MIN_LISTINGS_FOR_RIBBON).map(s => {
              const isActive = source === s.key
              return (
                <button
                  key={s.key}
                  onClick={() => setSource(isActive ? '' : s.key)}
                  className="flex-shrink-0 focus:outline-none rounded-lg transition-all duration-200"
                  style={{ opacity: isActive ? 1 : 0.68 }}
                  title={lang === 'ar' ? s.nameAr : s.nameEn}
                  aria-pressed={isActive}
                >
                  <div
                    className="flex items-center justify-center transition-all duration-200"
                    style={{
                      background: 'var(--bg-card)',
                      borderRadius: 16,
                      border: '1px solid',
                      borderColor: isActive ? 'var(--accent-primary)' : 'var(--hairline)',
                      boxShadow: isActive
                        ? '0 0 0 2px rgba(255,107,74,0.18), var(--shadow-soft)'
                        : 'var(--shadow-soft)',
                      width: 100,
                      height: 60,
                    }}
                  >
                    <img
                      src={s.logo} alt={s.nameEn}
                      className="h-6 w-auto object-contain"
                      style={{ maxWidth: 78 }}
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

      {/* ═══════════════════════════════════════════════════════════════════
          FILTER BAR — sticky below the global header (152px on every
          breakpoint here since both cuts are visible). Two rows of filter
          chips + active chips below.
      ═══════════════════════════════════════════════════════════════════ */}
      <div
        className="border-b sticky z-20"
        style={{
          top: 'var(--hdr-h, 152px)',
          background: 'rgba(248,250,252,0.96)',
          backdropFilter: 'blur(6px)',
          borderColor: 'var(--hairline)',
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        <div className="max-w-screen-xl mx-auto px-3">

          {/* ── Primary filter row (always visible) ──
              Per the latest spec: المدينة → السعر → الموديل → السنة (in
              RTL reading order). Body / fuel / transmission / condition /
              source / mileage moved into the side drawer. */}
          <div className="flex items-center gap-1.5 py-2 overflow-x-auto no-scrollbar">
            <Sel value={city} onChange={setCity}
              placeholder={tr.allCities} activeLabel={cityLabel_}>
              {cityOptions.map(c => (
                <SelectItem key={c.en} value={c.en}>
                  {lang === 'ar' ? (c.ar ?? c.en) : c.en}
                </SelectItem>
              ))}
            </Sel>

            <Sel value={maxPrice} onChange={setMaxPrice}
              placeholder={tr.anyPrice} activeLabel={priceLabel}>
              {tr.priceCaps.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </Sel>

            {/* Make is part of "Model" experience here — picking a model
                only makes sense if the make is set, so we keep them
                adjacent. Make is the smaller selector. */}
            <Sel value={make} onChange={v => { setMake(v); setModel('') }}
              placeholder={tr.allMakes}
              activeLabel={makes.find(m => m.value === make)?.label ?? make}>
              {makes.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </Sel>

            <Sel value={model} onChange={setModel}
              placeholder={tr.allModels}
              activeLabel={models.find(m => m.value === model)?.label ?? model}>
              {models.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </Sel>

            <Sel value={yearFrom} onChange={setYearFrom}
              placeholder={tr.fromYear} activeLabel={yearFrom} minW={92}>
              {YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </Sel>

            <Sel value={yearTo} onChange={setYearTo}
              placeholder={tr.toYear} activeLabel={yearTo} minW={92}>
              {YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </Sel>

            {/* "All filters" drawer trigger */}
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="flex-shrink-0 h-8 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--hairline)',
                color: 'var(--text-primary)',
                padding: '0 14px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6"  x2="20" y2="6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </svg>
              {lang === 'ar' ? 'كل الفلاتر' : 'All filters'}
              {drawerActiveCount > 0 && (
                <span
                  className="ms-1 inline-flex items-center justify-center rounded-full"
                  style={{
                    background: 'var(--accent-primary)',
                    color: '#FFFFFF',
                    width: 18, height: 18, fontSize: 10, fontWeight: 800,
                  }}
                >
                  {drawerActiveCount}
                </span>
              )}
            </button>

            {/* Sort + count anchor to the left (RTL = ms-auto). */}
            <div className="flex flex-shrink-0 ms-auto items-center gap-2 ps-2 border-s border-border">
              <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap hidden sm:inline">
                {filtered.length.toLocaleString()}
                <span className="font-normal ms-0.5">{lang === 'ar' ? ' نتيجة' : ' results'}</span>
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground whitespace-nowrap sm:hidden">
                {filtered.length.toLocaleString()}
              </span>
              <Sel value={sort} onChange={v => setSort(v as SortKey)}
                placeholder={tr.sortBestDeal} activeLabel={sortLabel} minW={140}>
                <SelectItem value="deal_score">{tr.sortBestDeal}</SelectItem>
                <SelectItem value="price_asc">{tr.sortPriceAsc}</SelectItem>
                <SelectItem value="price_desc">{tr.sortPriceDesc}</SelectItem>
                <SelectItem value="mileage_asc">{tr.sortMileageAsc}</SelectItem>
                <SelectItem value="year_desc">{tr.sortNewest}</SelectItem>
              </Sel>
            </div>
          </div>

          {/* ── Active filter chips ── */}
          <AnimatePresence>
            {hasFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-1.5 pb-2 overflow-x-auto no-scrollbar flex-wrap">
                  {activeChips.map(chip => (
                    <button
                      key={chip.label}
                      onClick={chip.clear}
                      className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full font-medium transition-opacity hover:opacity-70 whitespace-nowrap flex-shrink-0"
                      style={{
                        background: 'rgba(255,107,74,0.10)',
                        color: 'var(--accent-primary)',
                        border: '1px solid rgba(255,107,74,0.35)',
                      }}
                    >
                      {chip.label}
                      <span className="text-[10px] opacity-60">×</span>
                    </button>
                  ))}
                  <button
                    onClick={clearFilters}
                    className="text-[11px] text-muted-foreground underline ms-1 whitespace-nowrap flex-shrink-0"
                  >
                    {tr.clearAll}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          RESULTS
      ═══════════════════════════════════════════════════════════════════ */}
      <main className="max-w-screen-xl mx-auto px-4 py-6">
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
                {tr.clearAll}
              </Button>
            )}
          </motion.div>
        ) : (
          <>
            <motion.div
              variants={container}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            >
              {filtered.slice(0, displayCount).map((listing, i) => (
                <ListingCard key={listing.id} listing={listing} lang={lang} index={i} />
              ))}
            </motion.div>

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-12 flex items-center justify-center mt-4">
              {displayCount < filtered.length && (
                <span className="text-xs text-muted-foreground">
                  {lang === 'ar'
                    ? `${displayCount.toLocaleString()} من ${filtered.length.toLocaleString()}`
                    : `${displayCount.toLocaleString()} of ${filtered.length.toLocaleString()}`}
                </span>
              )}
            </div>
          </>
        )}
      </main>

      {/* ═══════════════════════════════════════════════════════════════════
          "كل الفلاتر" DRAWER — secondary filters (body / fuel / transmission
          / condition / source / mileage). Slides in from the right (RTL
          leading edge). Backdrop click + ESC close.
      ═══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {filtersOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setFiltersOpen(false)}
            className="fixed inset-0 z-50"
            style={{ background: 'rgba(15,23,42,0.45)' }}
          >
            <motion.aside
              dir="rtl"
              onClick={e => e.stopPropagation()}
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.22, ease: 'easeOut' }}
              className="absolute top-0 right-0 h-full w-full sm:w-[360px] flex flex-col"
              style={{ background: 'var(--bg-card)', boxShadow: 'var(--shadow-md)' }}
              role="dialog"
              aria-modal="true"
              aria-label={lang === 'ar' ? 'كل الفلاتر' : 'All filters'}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-4 py-3 border-b"
                style={{ borderColor: 'var(--hairline)' }}
              >
                <h2 className="font-extrabold text-base" style={{ color: 'var(--text-primary)' }}>
                  {lang === 'ar' ? 'كل الفلاتر' : 'All filters'}
                </h2>
                <button
                  onClick={() => setFiltersOpen(false)}
                  aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}
                  className="rounded-full w-8 h-8 inline-flex items-center justify-center hover:bg-slate-100 transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="6" y1="6" x2="18" y2="18" /><line x1="6" y1="18" x2="18" y2="6" />
                  </svg>
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
                <DrawerRow
                  label={lang === 'ar' ? 'النوع' : 'Body type'}
                  control={
                    <Sel value={bodyType} onChange={setBodyType}
                      placeholder={tr.allBodyTypes} activeLabel={bodyLabel}>
                      {bodyTypes.map(b => (
                        <SelectItem key={b} value={b}>
                          {lang === 'ar' ? BODY_AR[b] ?? b : BODY_EN[b] ?? b}
                        </SelectItem>
                      ))}
                    </Sel>
                  }
                />
                <DrawerRow
                  label={lang === 'ar' ? 'الوقود' : 'Fuel'}
                  control={
                    <Sel value={fuel} onChange={setFuel}
                      placeholder={tr.allFuels} activeLabel={fuelLabel}>
                      {fuelTypes.map(f => (
                        <SelectItem key={f} value={f}>
                          {lang === 'ar' ? FUEL_AR[f] ?? f : FUEL_EN[f] ?? f}
                        </SelectItem>
                      ))}
                    </Sel>
                  }
                />
                <DrawerRow
                  label={lang === 'ar' ? 'الناقل' : 'Transmission'}
                  control={
                    <Sel value={transmission} onChange={setTransmission}
                      placeholder={tr.allTransmissions} activeLabel={transLabel}>
                      {VALID_TRANS.map(t => (
                        <SelectItem key={t} value={t}>
                          {lang === 'ar' ? TRANS_AR[t] : TRANS_EN[t]}
                        </SelectItem>
                      ))}
                    </Sel>
                  }
                />
                <DrawerRow
                  label={lang === 'ar' ? 'الحالة' : 'Condition'}
                  control={
                    <Sel value={condition} onChange={setCondition}
                      placeholder={tr.allConditions} activeLabel={condLabel}>
                      {conditions.map(c => (
                        <SelectItem key={c} value={c}>
                          {lang === 'ar' ? COND_AR[c] ?? c : COND_EN[c] ?? c}
                        </SelectItem>
                      ))}
                    </Sel>
                  }
                />
                <DrawerRow
                  label={lang === 'ar' ? 'المصدر' : 'Source'}
                  control={
                    <Sel value={source} onChange={setSource}
                      placeholder={lang === 'ar' ? 'كل المصادر' : 'All sources'}
                      activeLabel={SOURCES.find(s => s.key === source)?.[lang === 'ar' ? 'nameAr' : 'nameEn'] ?? source}>
                      {SOURCES.map(s => (
                        <SelectItem key={s.key} value={s.key}>
                          {lang === 'ar' ? s.nameAr : s.nameEn}
                        </SelectItem>
                      ))}
                    </Sel>
                  }
                />
                <DrawerRow
                  label={lang === 'ar' ? 'العدّاد (الممشى)' : 'Mileage cap'}
                  control={
                    <Sel value={maxMileage} onChange={setMaxMileage}
                      placeholder={tr.anyMileage} activeLabel={mileageLabel}>
                      {tr.mileageCaps.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </Sel>
                  }
                />
              </div>

              {/* Footer */}
              <div
                className="px-4 py-3 flex items-center gap-2 border-t"
                style={{ borderColor: 'var(--hairline)' }}
              >
                <button
                  onClick={() => {
                    setBodyType(''); setFuel(''); setTransmission('')
                    setCondition(''); setSource(''); setMaxMileage('')
                  }}
                  className="text-sm font-semibold px-3 py-2 transition-colors hover:opacity-80"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {lang === 'ar' ? 'مسح' : 'Clear'}
                </button>
                <button
                  onClick={() => setFiltersOpen(false)}
                  className="ms-auto rounded-xl px-5 py-2 text-sm font-extrabold transition-opacity hover:opacity-90"
                  style={{ background: 'var(--accent-primary)', color: '#FFFFFF' }}
                >
                  {lang === 'ar' ? 'تطبيق' : 'Apply'}
                </button>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Tiny presentational helper used inside the filter drawer. Keeping it
// local because it's only meaningful in this layout.
function DrawerRow ({ label, control }: { label: string; control: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="text-[12px] font-semibold"
        style={{ color: 'var(--text-secondary)' }}
      >
        {label}
      </label>
      <div className="flex">{control}</div>
    </div>
  )
}
