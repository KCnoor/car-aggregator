export type Lang = 'ar' | 'en'

export const CITY_DISPLAY: Record<string, Record<Lang, string>> = {
  riyadh:    { ar: 'الرياض',     en: 'Riyadh' },
  jeddah:    { ar: 'جدة',         en: 'Jeddah' },
  dammam:    { ar: 'الدمام',      en: 'Dammam' },
  khobar:    { ar: 'الخبر',       en: 'Al Khobar' },
  mecca:     { ar: 'مكة المكرمة', en: 'Mecca' },
  medina:    { ar: 'المدينة المنورة', en: 'Medina' },
  abha:      { ar: 'أبها',        en: 'Abha' },
  taif:      { ar: 'الطائف',      en: 'Taif' },
  tabuk:     { ar: 'تبوك',        en: 'Tabuk' },
  qassim:    { ar: 'القصيم',      en: 'Qassim' },
  hail:      { ar: 'حائل',        en: 'Hail' },
  jubail:    { ar: 'الجبيل',      en: 'Jubail' },
  yanbu:     { ar: 'ينبع',        en: 'Yanbu' },
  najran:    { ar: 'نجران',       en: 'Najran' },
  jizan:     { ar: 'جازان',       en: 'Jizan' },
  'al-baha': { ar: 'الباحة',      en: 'Al Baha' },
  'al-jouf': { ar: 'الجوف',       en: 'Al Jouf' },
  bisha:     { ar: 'بيشة',        en: 'Bisha' },
  // Legacy English-key fallbacks (from old mock data)
  Riyadh:    { ar: 'الرياض',     en: 'Riyadh' },
  Jeddah:    { ar: 'جدة',         en: 'Jeddah' },
  Dammam:    { ar: 'الدمام',      en: 'Dammam' },
}

export function cityLabel(city: string | null | undefined, lang: Lang, cityAr?: string | null): string {
  if (!city) return ''
  if (lang === 'ar' && cityAr) return cityAr
  const key = city.toLowerCase().replace(/\s+/g, '-')
  return CITY_DISPLAY[city]?.[lang] ?? CITY_DISPLAY[key]?.[lang] ?? city
}

type Cap = { label: string; value: string }

export type Translations = {
  title: string
  subtitle: string
  listingsIndexed: (n: number) => string
  searchPlaceholder: string
  allMakes: string
  allModels: string
  allCities: string
  anyPrice: string
  anyMileage: string
  sortBestDeal: string
  sortPriceAsc: string
  sortPriceDesc: string
  sortNewest: string
  sortMileageAsc: string
  noExactMatch: string
  listingsFound: (n: number) => string
  clearFilters: string
  noListings: string
  noListingsSub: string
  nlPlaceholder: string
  nlSearch: string
  nlThinking: string
  nlPowered: string
  nlError: string
  nlClear: string
  nlShowing: string
  nlNoFilters: string
  nlIn: string
  nlYear: string
  nlFrom: string
  nlUnderPrice: string
  nlUnderMileage: string
  separator: string
  sar: string
  km: string
  dealer: string
  privateSeller: string
  greatDeal: string
  goodDeal: string
  fairPrice: string
  expensive: string
  overpriced: string
  pendingEval: string
  pendingEvalTooltip: string
  contactForPrice: string
  showContactForPrice: string
  lowPriceWarning: string
  basedOnCars: (n: number) => string
  aiAnalysis: string
  priceCaps: Cap[]
  mileageCaps: Cap[]
  toggleLang: string
}

export const translations: Record<Lang, Translations> = {
  ar: {
    title: 'كارسا',
    subtitle: 'سوق السيارات في السعودية',
    listingsIndexed: (n) => `${n.toLocaleString()} إعلان`,
    searchPlaceholder: 'ابحث عن الماركة أو الموديل...',
    allMakes: 'كل الماركات',
    allModels: 'كل الموديلات',
    allCities: 'كل المدن',
    anyPrice: 'أي سعر',
    anyMileage: 'أي عداد',
    sortBestDeal: 'أحسن صفقة أولاً',
    sortPriceAsc: 'السعر: من الأقل',
    sortPriceDesc: 'السعر: من الأعلى',
    sortNewest: 'الأحدث أولاً',
    sortMileageAsc: 'الأقل عداداً',
    noExactMatch: 'ما في تطابق دقيق — هذي أقرب النتائج',
    listingsFound: (n) => `${n.toLocaleString()} إعلان`,
    clearFilters: 'مسح الفلاتر',
    noListings: 'ما في إعلانات تطابق بحثك',
    noListingsSub: 'جرب تغيير معايير البحث',
    nlPlaceholder: 'جرب: "كامري رخيصة في الرياض" أو "cheap Patrol under 200k"',
    nlSearch: 'بحث',
    nlThinking: 'يفكر...',
    nlPowered: 'مدعوم بـ Claude AI · يدعم العربي والإنجليزي',
    nlError: 'صار خطأ، حاول مرة ثانية',
    nlClear: 'مسح',
    nlShowing: 'النتائج:',
    nlNoFilters: 'ما في فلاتر محددة - يعرض الكل',
    nlIn: 'في',
    nlYear: 'سنة',
    nlFrom: 'من سنة',
    nlUnderPrice: 'أقل من',
    nlUnderMileage: 'عداد أقل من',
    separator: ' · ',
    sar: 'ريال',
    km: 'كم',
    dealer: '🏢 معرض',
    privateSeller: '👤 مالك مباشر',
    greatDeal: 'صفقة ممتازة',
    goodDeal: 'صفقة جيدة',
    fairPrice: 'سعر عادل',
    expensive: 'سعر مرتفع',
    overpriced: 'سعر مبالغ فيه',
    pendingEval: 'جاري التقييم',
    pendingEvalTooltip: 'لسه ما عندنا بيانات كافية للتقييم',
    contactForPrice: 'اتصل للسعر',
    showContactForPrice: 'إظهار الإعلانات بدون سعر',
    lowPriceWarning: 'تحقق قبل الشراء — سعر منخفض بشكل غير عادي',
    basedOnCars: (n) => `مبني على ${n} سيارة مشابهة`,
    aiAnalysis: 'تحليل ذكي للسوق',
    priceCaps: [
      { label: 'أقل من 70,000 ريال',  value: '70000' },
      { label: 'أقل من 100,000 ريال', value: '100000' },
      { label: 'أقل من 150,000 ريال', value: '150000' },
      { label: 'أقل من 200,000 ريال', value: '200000' },
    ],
    mileageCaps: [
      { label: 'أقل من 30,000 كم', value: '30000' },
      { label: 'أقل من 50,000 كم', value: '50000' },
      { label: 'أقل من 80,000 كم', value: '80000' },
    ],
    toggleLang: 'English',
  },
  en: {
    title: 'CarSa',
    subtitle: 'Saudi Arabia car listings aggregator',
    listingsIndexed: (n) => `${n.toLocaleString()} listings indexed`,
    searchPlaceholder: 'Search make or model…',
    allMakes: 'All Makes',
    allModels: 'All Models',
    allCities: 'All Cities',
    anyPrice: 'Any Price',
    anyMileage: 'Any Mileage',
    sortBestDeal: 'Best Deal First',
    sortPriceAsc: 'Price: Low → High',
    sortPriceDesc: 'Price: High → Low',
    sortNewest: 'Newest First',
    sortMileageAsc: 'Lowest Mileage',
    noExactMatch: 'No exact match — here are the closest results',
    listingsFound: (n) => `${n.toLocaleString()} ${n === 1 ? 'listing' : 'listings'} found`,
    clearFilters: 'Clear filters',
    noListings: 'No listings match your filters',
    noListingsSub: 'Try adjusting your search criteria',
    nlPlaceholder: 'Try: "cheap Camry in Riyadh" or "باترول بأقل من 200 ألف"',
    nlSearch: 'Search',
    nlThinking: 'Thinking…',
    nlPowered: 'Powered by Claude AI · supports English and Arabic',
    nlError: 'Something went wrong. Try again.',
    nlClear: 'clear',
    nlShowing: 'Showing:',
    nlNoFilters: 'No specific filters found — showing all listings',
    nlIn: 'in',
    nlYear: 'year',
    nlFrom: 'from',
    nlUnderPrice: 'under',
    nlUnderMileage: 'under',
    separator: ', ',
    sar: 'SAR',
    km: 'km',
    dealer: '🏢 Dealer',
    privateSeller: '👤 Private seller',
    greatDeal: 'Great Deal',
    goodDeal: 'Good Deal',
    fairPrice: 'Fair Price',
    expensive: 'Expensive',
    overpriced: 'Overpriced',
    pendingEval: 'Pending evaluation',
    pendingEvalTooltip: 'Not enough comparable data yet to score this listing',
    contactForPrice: 'Contact for price',
    showContactForPrice: 'Show contact-for-price listings',
    lowPriceWarning: 'Verify before buying — unusually low price',
    basedOnCars: (n) => `Based on ${n} similar cars`,
    aiAnalysis: 'Smart market analysis',
    priceCaps: [
      { label: 'Under 70,000 SAR',  value: '70000' },
      { label: 'Under 100,000 SAR', value: '100000' },
      { label: 'Under 150,000 SAR', value: '150000' },
      { label: 'Under 200,000 SAR', value: '200000' },
    ],
    mileageCaps: [
      { label: 'Under 30,000 km', value: '30000' },
      { label: 'Under 50,000 km', value: '50000' },
      { label: 'Under 80,000 km', value: '80000' },
    ],
    toggleLang: 'العربية',
  },
}
