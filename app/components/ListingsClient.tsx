'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSearchParams, useRouter } from 'next/navigation'
import type { Listing } from '@/lib/supabase'
import { translations, cityLabel, type Lang } from '@/lib/translations'
import ListingCard from './ListingCard'
import { useLang } from './LangContext'
import {
  parseFilters,
  buildBrowseUrl,
  clearedUrl,
  hasAnyFilter,
  type Filters,
  type FiltersPatch,
  type SortKey,
} from '@/lib/listing-filters'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'

// ── Constants ────────────────────────────────────────────────────────────────
// Sentinel for the "All …" option in shadcn's <Select> — it doesn't allow
// empty-string values, so we round-trip an internal sentinel and treat it
// as "clear this filter" when it comes back out.
const ALL = '__all__'

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

// ── Source config ────────────────────────────────────────────────────────────
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

// Minimum count for a source to appear in the brand-ribbon row. Sources
// below this look under-curated; their listings still appear in search
// results, only the visual ribbon entry is suppressed.
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

type AIFilterResponse = {
  make?: string; model?: string; city?: string
  maxPrice?: number; minPrice?: number; maxMileage?: number
  minYear?: number; maxYear?: number
}

export default function ListingsClient ({
  listings,
  totalCount,
  currentPage = 1,
  totalPages = 1,
  pageSize = 50,
  sourceCounts = {},
  canonicalMakes = [],
  canonicalModels = [],
  presentMakes = [],
  presentModels = [],
  presentCities = [],
  presentBodyTypes = [],
  presentFuelTypes = [],
  presentTransmissions = [],
  presentConditions = [],
}: {
  listings: Listing[]
  totalCount: number
  currentPage?: number
  totalPages?: number
  pageSize?: number
  sourceCounts?: Record<string, number>
  canonicalMakes?: CanonicalMake[]
  canonicalModels?: CanonicalModel[]
  // Corpus-wide present-in-DB filter facets, computed in the server
  // component. The dropdowns surface only values that exist in the full
  // corpus past the 15k floor — never just what's on the current page.
  presentMakes?: string[]
  presentModels?: string[]
  presentCities?: { en: string; ar: string | null }[]
  presentBodyTypes?: string[]
  presentFuelTypes?: string[]
  presentTransmissions?: string[]
  presentConditions?: string[]
}) {
  const { lang } = useLang()
  const tr = translations[lang]
  const searchParams = useSearchParams()
  const router = useRouter()

  // ── Filters: URL is the source of truth ──────────────────────────────────
  //
  // parseFilters returns the same shape the server uses, so the chips row,
  // the dropdowns, and the result count are all reading from the same
  // typed object.
  const filters = useMemo(() => parseFilters(searchParams), [searchParams])

  // Push helper: build a fresh URL from the current filters + a patch,
  // then router.push(). The buildBrowseUrl helper resets page=1 on any
  // non-page change, so jumping to page 1 of a new filter is automatic.
  function pushPatch (patch: FiltersPatch) {
    const url = buildBrowseUrl(filters, patch)
    router.push(url, { scroll: false })
  }

  function goToPage (n: number) {
    const clamped = Math.min(Math.max(1, n), totalPages)
    const url = buildBrowseUrl(filters, { page: clamped })
    router.push(url, { scroll: true })
  }

  function clearAll () {
    router.push(clearedUrl(filters), { scroll: false })
  }

  // ── AI search: parses a free-text query into filters, then pushes them
  // into the URL. The header search box already sets ?q=…; we watch for
  // that here and resolve it into structured params on the way in.
  const [nlSummary, setNlSummary] = useState('')
  const lastAppliedQ = useRef<string>('')

  useEffect(() => {
    const q = filters.q ?? ''
    if (!q) {
      if (lastAppliedQ.current) {
        lastAppliedQ.current = ''
        setNlSummary('')
      }
      return
    }
    if (q === lastAppliedQ.current) return
    lastAppliedQ.current = q

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
        })
        const { filters: ai, sort } = await res.json() as {
          filters: AIFilterResponse
          sort: string | null
        }
        if (cancelled) return

        // Translate the AI's parsed result into a URL patch. We DON'T
        // re-push if nothing was extracted — leave ?q= alone so the
        // summary line stays visible.
        const patch: FiltersPatch = {
          make:       ai.make,
          model:      ai.model,
          city:       ai.city,
          priceMin:   ai.minPrice,
          priceMax:   ai.maxPrice,
          mileageMax: ai.maxMileage,
          yearFrom:   ai.minYear,
          yearTo:     ai.maxYear,
        }
        if (sort && ['deal_score','price_asc','price_desc','mileage_asc','year_desc'].includes(sort)) {
          patch.sort = sort as SortKey
        }
        const meaningful = Object.values(patch).some(v => v !== undefined)
        if (meaningful) {
          // Render summary BEFORE pushing so the new URL won't trigger
          // a re-fetch loop (the useEffect runs again after navigation,
          // sees q unchanged, no-ops).
          const parts: string[] = []
          if (ai.make)       parts.push(ai.make)
          if (ai.model)      parts.push(ai.model)
          if (ai.city)       parts.push(`${tr.nlIn} ${cityLabel(ai.city, lang)}`)
          if (ai.maxPrice)   parts.push(`${tr.nlUnderPrice} ${ai.maxPrice.toLocaleString()} ${tr.sar}`)
          if (ai.maxMileage) parts.push(`${tr.nlUnderMileage} ${ai.maxMileage.toLocaleString()} ${tr.km}`)
          setNlSummary(parts.length ? `${tr.nlShowing} ${parts.join(tr.separator)}` : tr.nlNoFilters)
          // Drop the raw q from the URL once we've translated it into
          // structured filters — keeps the URL short and avoids the AI
          // re-running on every navigation. The summary line stays
          // mounted in component state.
          patch.q = undefined
          pushPatch(patch)
        } else {
          setNlSummary(tr.nlNoFilters)
        }
      } catch {
        if (!cancelled) setNlSummary(tr.nlError)
      }
    })()

    return () => { cancelled = true }
    // pushPatch / tr depend on filters, but re-running on every filter
    // change is the wrong behaviour — we only want to react to q changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q])

  function clearNlSummary () {
    setNlSummary('')
    lastAppliedQ.current = ''
  }

  // ── Derived option lists for the dropdowns ────────────────────────────────
  // All driven by the corpus-wide present-* sets the server passed in. The
  // dropdowns never narrow further as other filters are applied (matches
  // the Amazon / eBay pattern — picking City: Riyadh doesn't hide makes
  // that exist outside Riyadh).
  type Option = { value: string; label: string }

  const presentMakeSet  = useMemo(() => new Set(presentMakes),  [presentMakes])
  const presentModelSet = useMemo(() => new Set(presentModels), [presentModels])

  const makes: Option[] = useMemo(() => {
    if (canonicalMakes.length) {
      return canonicalMakes
        .filter(m => presentMakeSet.has(m.canonical_name_en))
        .map(m => ({
          value: m.canonical_name_en,
          label: lang === 'ar' ? m.canonical_name_ar : m.canonical_name_en,
        }))
    }
    return [...presentMakes].sort().map(s => ({ value: s, label: s }))
  }, [canonicalMakes, presentMakeSet, presentMakes, lang])

  const models: Option[] = useMemo(() => {
    if (!filters.make) {
      // No make selected: surface the top 30 models by present-in-corpus
      // count would require an extra query; instead show all models
      // present somewhere in the corpus, alphabetised.
      return [...presentModels].sort().map(s => ({ value: s, label: s }))
    }
    if (canonicalModels.length) {
      const selectedMake = canonicalMakes.find(
        m => m.canonical_name_en.toLowerCase() === filters.make!.toLowerCase(),
      )
      if (selectedMake) {
        return canonicalModels
          .filter(cm =>
            cm.canonical_make_slug === selectedMake.canonical_make_slug &&
            presentModelSet.has(cm.canonical_name_en),
          )
          .map(cm => ({
            value: cm.canonical_name_en,
            label: lang === 'ar' ? cm.canonical_name_ar : cm.canonical_name_en,
          }))
      }
    }
    // Catalogue fallback: only present models that look related (we can't
    // join here without the canonical table). Best-effort: show all.
    return [...presentModels].sort().map(s => ({ value: s, label: s }))
  }, [canonicalModels, canonicalMakes, presentModelSet, presentModels, filters.make, lang])

  const cityOptions = useMemo(() =>
    [...presentCities].sort((a, b) => a.en.localeCompare(b.en)),
  [presentCities])

  // ── "All filters" drawer ─────────────────────────────────────────────────
  const [filtersOpen, setFiltersOpen] = useState(false)
  const drawerActiveCount = [filters.body, filters.fuel, filters.trans, filters.cond, filters.source, filters.mileageMax]
    .filter(Boolean).length

  // ── Active chips (RTL: ms-auto puts them on the leading side) ────────────
  const cityLabel_ = filters.city
    ? cityLabel(filters.city, lang, cityOptions.find(c => c.en.toLowerCase() === filters.city!.toLowerCase())?.ar ?? null)
    : ''
  const priceLabel   = filters.priceMax ? tr.priceCaps.find(p => p.value === String(filters.priceMax))?.label   ?? `≤ ${filters.priceMax.toLocaleString()}` : ''
  const mileageLabel = filters.mileageMax ? tr.mileageCaps.find(p => p.value === String(filters.mileageMax))?.label ?? `≤ ${filters.mileageMax.toLocaleString()}` : ''
  const bodyLabel    = filters.body     ? (lang === 'ar' ? BODY_AR[filters.body]   : BODY_EN[filters.body])   ?? filters.body     : ''
  const transLabel   = filters.trans    ? (lang === 'ar' ? TRANS_AR[filters.trans] : TRANS_EN[filters.trans]) ?? filters.trans    : ''
  const fuelLabel    = filters.fuel     ? (lang === 'ar' ? FUEL_AR[filters.fuel]   : FUEL_EN[filters.fuel])   ?? filters.fuel     : ''
  const condLabel    = filters.cond     ? (lang === 'ar' ? COND_AR[filters.cond]   : COND_EN[filters.cond])   ?? filters.cond     : ''
  const yearChipLabel = filters.yearFrom && filters.yearTo ? `${filters.yearFrom} – ${filters.yearTo}`
    : filters.yearFrom ? `${lang === 'ar' ? 'من' : 'from'} ${filters.yearFrom}`
    : filters.yearTo   ? `${lang === 'ar' ? 'حتى' : 'to'} ${filters.yearTo}` : ''

  type Chip = { label: string; clear: () => void }
  const activeChips: Chip[] = [
    filters.make         && { label: makes.find(m => m.value.toLowerCase() === filters.make!.toLowerCase())?.label ?? filters.make,
                              clear: () => pushPatch({ make: undefined, model: undefined }) },
    filters.model        && { label: models.find(m => m.value.toLowerCase() === filters.model!.toLowerCase())?.label ?? filters.model,
                              clear: () => pushPatch({ model: undefined }) },
    yearChipLabel        && { label: yearChipLabel, clear: () => pushPatch({ yearFrom: undefined, yearTo: undefined }) },
    priceLabel           && { label: priceLabel,    clear: () => pushPatch({ priceMax: undefined }) },
    mileageLabel         && { label: mileageLabel,  clear: () => pushPatch({ mileageMax: undefined }) },
    cityLabel_           && { label: cityLabel_,    clear: () => pushPatch({ city: undefined }) },
    bodyLabel            && { label: bodyLabel,     clear: () => pushPatch({ body: undefined }) },
    transLabel           && { label: transLabel,    clear: () => pushPatch({ trans: undefined }) },
    fuelLabel            && { label: fuelLabel,     clear: () => pushPatch({ fuel: undefined }) },
    condLabel            && { label: condLabel,     clear: () => pushPatch({ cond: undefined }) },
    filters.source       && { label: SOURCES.find(s => s.key === filters.source)?.[lang === 'ar' ? 'nameAr' : 'nameEn'] ?? filters.source,
                              clear: () => pushPatch({ source: undefined }) },
    filters.new24h       && { label: lang === 'ar' ? 'آخر 24 ساعة' : 'Last 24h',
                              clear: () => pushPatch({ new24h: undefined }) },
    nlSummary            && { label: lang === 'ar' ? 'بحث ذكي' : 'AI search',
                              clear: () => { clearNlSummary(); pushPatch({}) } },
  ].filter(Boolean) as Chip[]

  const hasFilters = hasAnyFilter(filters) || nlSummary !== ''

  const sortLabel = {
    deal_score: tr.sortBestDeal, price_asc: tr.sortPriceAsc,
    price_desc: tr.sortPriceDesc, year_desc: tr.sortNewest, mileage_asc: tr.sortMileageAsc,
  }[filters.sort]

  // ── Generic Select helper ────────────────────────────────────────────────
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

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-page)' }}>
      {/* AI search summary line (only while a parsed query is active). */}
      {nlSummary && (
        <div className="max-w-screen-xl mx-auto px-4 pt-3">
          <div className="flex items-center justify-center gap-2" dir="auto">
            <span style={{ color: 'var(--accent-primary)' }}>✦</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{nlSummary}</span>
            <button
              onClick={clearNlSummary}
              className="text-[12px] underline"
              style={{ color: 'var(--accent-primary)' }}
            >
              {tr.nlClear}
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        {/* ── Source ribbon ── */}
        <div
          className="border-t border-b"
          style={{ borderColor: 'var(--hairline)', background: '#F8FAFC' }}
        >
          <div className="max-w-screen-xl mx-auto px-4 py-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => pushPatch({ source: undefined })}
              className="flex-shrink-0 h-7 px-3.5 rounded-full border text-[11px] font-semibold transition-all whitespace-nowrap"
              style={!filters.source
                ? { background: 'var(--accent-primary)', color: '#FFFFFF', borderColor: 'var(--accent-primary)' }
                : { background: 'var(--bg-card)', color: 'var(--text-secondary)', borderColor: 'var(--hairline)' }
              }
            >
              {lang === 'ar' ? 'الكل' : 'All'}
            </button>

            {SOURCES.filter(s => (sourceCounts[s.key] ?? Infinity) >= MIN_LISTINGS_FOR_RIBBON).map(s => {
              const isActive = filters.source === s.key
              return (
                <button
                  key={s.key}
                  onClick={() => pushPatch({ source: isActive ? undefined : s.key })}
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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
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

      {/* ═════════════════ FILTER BAR ═════════════════ */}
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

          {/* Primary filter row (always visible). */}
          <div className="flex items-center gap-1.5 py-2 overflow-x-auto no-scrollbar">
            <Sel value={filters.city ?? ''} onChange={v => pushPatch({ city: v || undefined })}
              placeholder={tr.allCities} activeLabel={cityLabel_}>
              {cityOptions.map(c => (
                <SelectItem key={c.en} value={c.en}>
                  {lang === 'ar' ? (c.ar ?? c.en) : c.en}
                </SelectItem>
              ))}
            </Sel>

            <Sel value={filters.priceMax ? String(filters.priceMax) : ''}
              onChange={v => pushPatch({ priceMax: v ? parseInt(v, 10) : undefined })}
              placeholder={tr.anyPrice} activeLabel={priceLabel}>
              {tr.priceCaps.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </Sel>

            <Sel value={filters.make ?? ''}
              onChange={v => pushPatch({ make: v || undefined, model: undefined })}
              placeholder={tr.allMakes}
              activeLabel={makes.find(m => m.value.toLowerCase() === filters.make?.toLowerCase())?.label ?? filters.make ?? ''}>
              {makes.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </Sel>

            <Sel value={filters.model ?? ''} onChange={v => pushPatch({ model: v || undefined })}
              placeholder={tr.allModels}
              activeLabel={models.find(m => m.value.toLowerCase() === filters.model?.toLowerCase())?.label ?? filters.model ?? ''}>
              {models.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </Sel>

            <Sel value={filters.yearFrom ? String(filters.yearFrom) : ''}
              onChange={v => pushPatch({ yearFrom: v ? parseInt(v, 10) : undefined })}
              placeholder={tr.fromYear} activeLabel={filters.yearFrom ? String(filters.yearFrom) : ''} minW={92}>
              {YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </Sel>

            <Sel value={filters.yearTo ? String(filters.yearTo) : ''}
              onChange={v => pushPatch({ yearTo: v ? parseInt(v, 10) : undefined })}
              placeholder={tr.toYear} activeLabel={filters.yearTo ? String(filters.yearTo) : ''} minW={92}>
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

            {/* Sort + filtered-total. Total is the SERVER count of all
                filtered rows, not the in-memory page slice. */}
            <div className="flex flex-shrink-0 ms-auto items-center gap-2 ps-2 border-s border-border">
              <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap hidden sm:inline">
                {totalCount.toLocaleString()}
                <span className="font-normal ms-0.5">{lang === 'ar' ? ' نتيجة' : ' results'}</span>
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground whitespace-nowrap sm:hidden">
                {totalCount.toLocaleString()}
              </span>
              <Sel value={filters.sort}
                onChange={v => pushPatch({ sort: (v as SortKey) || 'deal_score' })}
                placeholder={tr.sortBestDeal} activeLabel={sortLabel} minW={140}>
                <SelectItem value="deal_score">{tr.sortBestDeal}</SelectItem>
                <SelectItem value="price_asc">{tr.sortPriceAsc}</SelectItem>
                <SelectItem value="price_desc">{tr.sortPriceDesc}</SelectItem>
                <SelectItem value="mileage_asc">{tr.sortMileageAsc}</SelectItem>
                <SelectItem value="year_desc">{tr.sortNewest}</SelectItem>
              </Sel>
            </div>
          </div>

          {/* Active filter chips */}
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
                    onClick={() => { clearNlSummary(); clearAll() }}
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

      {/* ═════════════════ RESULTS ═════════════════ */}
      <main className="max-w-screen-xl mx-auto px-4 py-6">
        {listings.length === 0 ? (
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
              <Button variant="outline" size="sm" onClick={() => { clearNlSummary(); clearAll() }} className="mt-4 rounded-xl">
                {tr.clearAll}
              </Button>
            )}
          </motion.div>
        ) : (
          <>
            {/* Compact pager top-right */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                {lang === 'ar'
                  ? `الصفحة ${currentPage} من ${totalPages}`
                  : `Page ${currentPage} of ${totalPages}`}
              </span>
              <PagerCompact
                currentPage={currentPage}
                totalPages={totalPages}
                onPage={goToPage}
                lang={lang}
              />
            </div>

            <motion.div
              variants={container}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            >
              {listings.map((listing, i) => (
                <ListingCard key={listing.id} listing={listing} lang={lang} index={i} />
              ))}
            </motion.div>

            {/* Full pager at the bottom of the grid */}
            <div className="mt-8">
              <PagerFull
                currentPage={currentPage}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={pageSize}
                onPage={goToPage}
                lang={lang}
              />
            </div>
          </>
        )}
      </main>

      {/* ═════════════════ "كل الفلاتر" drawer ═════════════════ */}
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
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
              onClick={e => e.stopPropagation()}
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.22, ease: 'easeOut' }}
              className="absolute top-0 right-0 h-full w-full sm:w-[360px] flex flex-col"
              style={{ background: 'var(--bg-card)', boxShadow: 'var(--shadow-md)' }}
              role="dialog"
              aria-modal="true"
              aria-label={lang === 'ar' ? 'كل الفلاتر' : 'All filters'}
            >
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

              <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
                <DrawerRow
                  label={lang === 'ar' ? 'النوع' : 'Body type'}
                  control={
                    <Sel value={filters.body ?? ''} onChange={v => pushPatch({ body: v || undefined })}
                      placeholder={tr.allBodyTypes} activeLabel={bodyLabel}>
                      {presentBodyTypes.map(b => (
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
                    <Sel value={filters.fuel ?? ''} onChange={v => pushPatch({ fuel: v || undefined })}
                      placeholder={tr.allFuels} activeLabel={fuelLabel}>
                      {presentFuelTypes.map(f => (
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
                    <Sel value={filters.trans ?? ''} onChange={v => pushPatch({ trans: v || undefined })}
                      placeholder={tr.allTransmissions} activeLabel={transLabel}>
                      {VALID_TRANS.filter(t => presentTransmissions.includes(t)).map(t => (
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
                    <Sel value={filters.cond ?? ''} onChange={v => pushPatch({ cond: v || undefined })}
                      placeholder={tr.allConditions} activeLabel={condLabel}>
                      {presentConditions.map(c => (
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
                    <Sel value={filters.source ?? ''} onChange={v => pushPatch({ source: v || undefined })}
                      placeholder={lang === 'ar' ? 'كل المصادر' : 'All sources'}
                      activeLabel={SOURCES.find(s => s.key === filters.source)?.[lang === 'ar' ? 'nameAr' : 'nameEn'] ?? filters.source ?? ''}>
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
                    <Sel value={filters.mileageMax ? String(filters.mileageMax) : ''}
                      onChange={v => pushPatch({ mileageMax: v ? parseInt(v, 10) : undefined })}
                      placeholder={tr.anyMileage} activeLabel={mileageLabel}>
                      {tr.mileageCaps.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </Sel>
                  }
                />
              </div>

              <div
                className="px-4 py-3 flex items-center gap-2 border-t"
                style={{ borderColor: 'var(--hairline)' }}
              >
                <button
                  onClick={() => pushPatch({
                    body: undefined, fuel: undefined, trans: undefined,
                    cond: undefined, source: undefined, mileageMax: undefined,
                  })}
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

// Small presentational helper for the drawer rows.
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

// ── Pagination ───────────────────────────────────────────────────────────────
function PagerCompact ({
  currentPage, totalPages, onPage, lang,
}: {
  currentPage: number; totalPages: number; onPage: (n: number) => void; lang: Lang
}) {
  if (totalPages <= 1) return null
  const isFirst = currentPage <= 1
  const isLast  = currentPage >= totalPages
  return (
    <div className="inline-flex items-center gap-1">
      <button
        onClick={() => onPage(currentPage - 1)}
        disabled={isFirst}
        className="rounded-lg px-2.5 py-1 text-[12px] font-semibold border transition-colors disabled:opacity-40"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--hairline)', color: 'var(--text-primary)' }}
      >
        {lang === 'ar' ? 'السابق →' : '← Prev'}
      </button>
      <button
        onClick={() => onPage(currentPage + 1)}
        disabled={isLast}
        className="rounded-lg px-2.5 py-1 text-[12px] font-bold border transition-colors disabled:opacity-40"
        style={{
          background: isLast ? 'var(--bg-card)' : 'var(--accent-primary)',
          borderColor: isLast ? 'var(--hairline)' : 'var(--accent-primary)',
          color: isLast ? 'var(--text-secondary)' : '#FFFFFF',
        }}
      >
        {lang === 'ar' ? '← التالي' : 'Next →'}
      </button>
    </div>
  )
}

function PagerFull ({
  currentPage, totalPages, totalCount, pageSize, onPage, lang,
}: {
  currentPage: number; totalPages: number
  totalCount: number; pageSize: number
  onPage: (n: number) => void
  lang: Lang
}) {
  if (totalPages <= 1) return null
  const window = 2
  const pages: (number | 'gap')[] = []
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - window && i <= currentPage + window)) {
      pages.push(i)
    } else if (pages[pages.length - 1] !== 'gap') {
      pages.push('gap')
    }
  }
  const from = (currentPage - 1) * pageSize + 1
  const to   = Math.min(totalCount, currentPage * pageSize)

  return (
    <nav
      className="flex flex-col sm:flex-row items-center justify-between gap-3"
      aria-label={lang === 'ar' ? 'تنقّل بين الصفحات' : 'Pagination'}
    >
      <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
        {lang === 'ar'
          ? `عرض ${from.toLocaleString()}–${to.toLocaleString()} من ${totalCount.toLocaleString()}`
          : `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${totalCount.toLocaleString()}`}
      </span>
      <div className="inline-flex items-center gap-1 flex-wrap" dir="ltr">
        <button
          onClick={() => onPage(currentPage - 1)}
          disabled={currentPage <= 1}
          className="rounded-lg w-9 h-9 inline-flex items-center justify-center text-[13px] font-semibold border transition-colors disabled:opacity-40"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--hairline)', color: 'var(--text-primary)' }}
          aria-label={lang === 'ar' ? 'السابق' : 'Previous'}
        >‹</button>
        {pages.map((p, i) =>
          p === 'gap'
            ? <span key={`gap-${i}`} className="px-1 text-[13px]" style={{ color: 'var(--text-secondary)' }}>…</span>
            : (
              <button
                key={p}
                onClick={() => onPage(p)}
                aria-current={p === currentPage ? 'page' : undefined}
                className="rounded-lg w-9 h-9 inline-flex items-center justify-center text-[13px] font-semibold border transition-colors"
                style={{
                  background: p === currentPage ? 'var(--accent-primary)' : 'var(--bg-card)',
                  borderColor: p === currentPage ? 'var(--accent-primary)' : 'var(--hairline)',
                  color: p === currentPage ? '#FFFFFF' : 'var(--text-primary)',
                }}
              >
                {p}
              </button>
            )
        )}
        <button
          onClick={() => onPage(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="rounded-lg w-9 h-9 inline-flex items-center justify-center text-[13px] font-semibold border transition-colors disabled:opacity-40"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--hairline)', color: 'var(--text-primary)' }}
          aria-label={lang === 'ar' ? 'التالي' : 'Next'}
        >›</button>
      </div>
    </nav>
  )
}
