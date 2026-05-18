// Shared filter contract for /browse (and the same shape works for any
// future page that needs to filter `listings`).
//
// Source of truth is the URL. Both the server component (browse/page.tsx)
// and the client (ListingsClient) read from the same parseFilters() output
// so the two views can never drift.
//
// Adding a new filter is a one-touch change here — extend Filters, add a
// parser entry, add an applier entry. The components below pick it up.
//
// The 15k SAR floor is applied UNCONDITIONALLY (see PRICE_FLOOR_SAR
// below) so the discovery surface never re-introduces sub-15k junk even
// if a future filter forgets to set it.

import type { Lang } from './translations'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseQuery = any

export const PRICE_FLOOR_SAR = 15000
export const BROWSE_PAGE_SIZE = 50

export type SortKey =
  | 'deal_score' | 'price_asc' | 'price_desc'
  | 'year_desc'  | 'mileage_asc'

const VALID_SORTS: readonly SortKey[] = [
  'deal_score', 'price_asc', 'price_desc', 'year_desc', 'mileage_asc',
] as const

export type Filters = {
  source?:     string  // single source slug (lowercase)
  city?:       string  // English city name (matches listings.city_en, case-insensitive)
  make?:       string  // English make name (matches listings.make_en, case-insensitive)
  model?:      string  // English model name (matches listings.model_en, case-insensitive)
  yearFrom?:   number
  yearTo?:     number
  priceMin?:   number
  priceMax?:   number
  mileageMax?: number
  body?:       string  // body_type_slug
  fuel?:       string  // fuel_type_slug
  trans?:      string  // transmission_slug
  cond?:       string  // condition (used/new)
  new24h?:     boolean
  q?:          string  // raw search query (for the AI search summary line)
  sort:        SortKey // never undefined — defaults to 'deal_score'
  page:        number  // 1-indexed; never less than 1
}

// ── URL → typed Filters ──────────────────────────────────────────────────────
//
// Accepts both a URLSearchParams (client side, from useSearchParams) and
// the plain object Next.js hands the server component (typed string |
// string[] | undefined per key).
export type RawParams =
  | URLSearchParams
  | Record<string, string | string[] | undefined>

function readParam (raw: RawParams, key: string): string | undefined {
  if (raw instanceof URLSearchParams) {
    return raw.get(key) ?? undefined
  }
  const v = raw[key]
  if (typeof v === 'string') return v
  if (Array.isArray(v))      return v[0]
  return undefined
}

function readInt (raw: RawParams, key: string): number | undefined {
  const v = readParam(raw, key)
  if (!v) return undefined
  const n = parseInt(v, 10)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export function parseFilters (raw: RawParams): Filters {
  const sortRaw = readParam(raw, 'sort') as SortKey | undefined
  const sort: SortKey = sortRaw && VALID_SORTS.includes(sortRaw) ? sortRaw : 'deal_score'
  const page = Math.max(1, readInt(raw, 'page') ?? 1)

  return {
    source:     readParam(raw, 'source')?.trim().toLowerCase() || undefined,
    city:       readParam(raw, 'city')?.trim()  || undefined,
    make:       readParam(raw, 'make')?.trim()  || undefined,
    model:      readParam(raw, 'model')?.trim() || undefined,
    yearFrom:   readInt(raw, 'year_from'),
    yearTo:     readInt(raw, 'year_to'),
    priceMin:   readInt(raw, 'price_min'),
    priceMax:   readInt(raw, 'price_max'),
    mileageMax: readInt(raw, 'mileage_max'),
    body:       readParam(raw, 'body')?.trim()  || undefined,
    fuel:       readParam(raw, 'fuel')?.trim()  || undefined,
    trans:      readParam(raw, 'trans')?.trim() || undefined,
    cond:       readParam(raw, 'cond')?.trim()  || undefined,
    new24h:     readParam(raw, 'new24h') === '1' ? true : undefined,
    q:          readParam(raw, 'q')?.trim()     || undefined,
    sort,
    page,
  }
}

// True iff any narrowing filter is set (sort + page don't count as
// "filters" for the purposes of the chips row / "clear all" button).
export function hasAnyFilter (f: Filters): boolean {
  return Boolean(
    f.source || f.city || f.make || f.model ||
    f.yearFrom || f.yearTo ||
    f.priceMin || f.priceMax || f.mileageMax ||
    f.body || f.fuel || f.trans || f.cond ||
    f.new24h || f.q,
  )
}

// ── Filters → Supabase query ──────────────────────────────────────────────────
//
// `since24h` is the ISO timestamp for the new-deals-today filter; pass it
// in from the server component (kept here as a parameter so the helper
// stays pure and doesn't reach for Date.now() during render).
//
// Order matters: build the query, apply the base constraints + 15k floor,
// then apply each filter that's set. Caller is responsible for ordering,
// ranging, and selecting columns.
export function applyListingFilters (
  q: SupabaseQuery,
  f: Filters,
  since24h: string,
): SupabaseQuery {
  q = q.eq('is_active', true)
       .neq('freshness_state', 'dead')
       .gte('price_sar', PRICE_FLOOR_SAR)

  if (f.source)   q = q.eq('source', f.source)
  if (f.city)     q = q.ilike('city_en',  f.city)
  if (f.make)     q = q.ilike('make_en',  f.make)
  if (f.model)    q = q.ilike('model_en', f.model)
  if (f.yearFrom) q = q.gte('year', f.yearFrom)
  if (f.yearTo)   q = q.lte('year', f.yearTo)
  if (f.priceMin) q = q.gte('price_sar', f.priceMin)
  if (f.priceMax) q = q.lte('price_sar', f.priceMax)
  if (f.mileageMax) q = q.or(`mileage_km.is.null,mileage_km.lte.${f.mileageMax}`)
  if (f.body)     q = q.eq('body_type_slug',    f.body)
  if (f.fuel)     q = q.eq('fuel_type_slug',    f.fuel)
  if (f.trans)    q = q.eq('transmission_slug', f.trans)
  if (f.cond)     q = q.eq('condition', f.cond)
  if (f.new24h)   q = q.gte('first_seen_at', since24h)

  return q
}

export function applyListingSort (q: SupabaseQuery, sort: SortKey): SupabaseQuery {
  switch (sort) {
    case 'price_asc':
      return q.order('price_sar', { ascending: true,  nullsFirst: false })
    case 'price_desc':
      return q.order('price_sar', { ascending: false, nullsFirst: false })
    case 'mileage_asc':
      return q.order('mileage_km', { ascending: true,  nullsFirst: false })
    case 'year_desc':
      return q.order('year', { ascending: false, nullsFirst: false })
    case 'deal_score':
    default:
      return q.order('deal_score', { ascending: false, nullsFirst: false })
  }
}

// ── Build URL helpers (used by the client to push filter changes) ────────────
//
// `update` is a partial filter patch. Any field set to `undefined` (or an
// empty string / `false` / 0) is REMOVED from the URL. Sort and page get
// special handling: sort defaults to 'deal_score' (omitted from URL when
// it's the default); page resets to 1 on any non-page change unless the
// caller passes an explicit page in the patch.
export type FiltersPatch = Partial<Filters>

const URL_KEYS: ReadonlyArray<[keyof Filters, string]> = [
  ['source',     'source'],
  ['city',       'city'],
  ['make',       'make'],
  ['model',      'model'],
  ['yearFrom',   'year_from'],
  ['yearTo',     'year_to'],
  ['priceMin',   'price_min'],
  ['priceMax',   'price_max'],
  ['mileageMax', 'mileage_max'],
  ['body',       'body'],
  ['fuel',       'fuel'],
  ['trans',      'trans'],
  ['cond',       'cond'],
  ['new24h',     'new24h'],
  ['q',          'q'],
]

export function buildBrowseUrl (
  current: Filters,
  patch: FiltersPatch = {},
): string {
  const next: Filters = { ...current, ...patch }
  // Any non-page mutation resets page to 1 unless caller explicitly set
  // one in the patch.
  const patchTouchesPage = 'page' in patch
  if (!patchTouchesPage) {
    const filterKeysTouched = Object.keys(patch).some(k => k !== 'sort' && k !== 'page')
    if (filterKeysTouched || 'sort' in patch) next.page = 1
  }

  const sp = new URLSearchParams()
  for (const [k, urlKey] of URL_KEYS) {
    const v = next[k]
    if (v === undefined || v === null || v === '' || v === false || v === 0) continue
    sp.set(urlKey, v === true ? '1' : String(v))
  }
  if (next.sort && next.sort !== 'deal_score') sp.set('sort', next.sort)
  if (next.page && next.page > 1)              sp.set('page', String(next.page))

  const qs = sp.toString()
  return qs ? `/browse?${qs}` : '/browse'
}

// Convenience for the "clear all" affordance — keeps only sort.
export function clearedUrl (current: Filters): string {
  const sp = new URLSearchParams()
  if (current.sort && current.sort !== 'deal_score') sp.set('sort', current.sort)
  const qs = sp.toString()
  return qs ? `/browse?${qs}` : '/browse'
}

// ── Lookup labels for the chips row ──────────────────────────────────────────
//
// Doesn't belong in this file long-term but localising it here keeps the
// chip rendering symmetric with the parser (one place where source/city/
// etc strings get formatted).
export function cityCanonical (s: string | undefined): string | undefined {
  return s?.trim() || undefined
}
// Just re-exports so the consumer can import everything from one place.
export type { Lang }
