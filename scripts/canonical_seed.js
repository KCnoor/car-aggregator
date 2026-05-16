'use strict'
// Canonical make/model seed for the lite catalogue.
//
// Each MAKE row: { slug, en, ar, altEn: string[], altAr: string[] }
// Each MODEL row: { make_slug, slug, en, ar, altEn: string[] }
//
// Alternates are matched case-insensitively against the listings.make_slug /
// model_slug columns. Anything not matched on canonicalization gets
// `needs_make_review = true` on the listing. The seed covers all 60+ makes
// that appear with ≥8 listings in the current corpus, plus consolidation of
// the most common dirty cases (Mercedes-Benz triplicates, single-letter
// Mercedes model letters → -class, BMW series, Lexus letter models, etc.).
//
// To add a make/model: edit this file, then `node scripts/seed_canonical.js`.

const MAKES = [
  // Japanese
  { slug: 'toyota',     en: 'Toyota',     ar: 'تويوتا',     altEn: ['toyota','tyota'], altAr: ['تويوتا'] },
  { slug: 'honda',      en: 'Honda',      ar: 'هوندا',      altEn: ['honda'], altAr: ['هوندا'] },
  { slug: 'nissan',     en: 'Nissan',     ar: 'نيسان',      altEn: ['nissan'], altAr: ['نيسان'] },
  { slug: 'mazda',      en: 'Mazda',      ar: 'مازدا',      altEn: ['mazda'], altAr: ['مازدا'] },
  { slug: 'mitsubishi', en: 'Mitsubishi', ar: 'ميتسوبيشي',  altEn: ['mitsubishi'], altAr: ['ميتسوبيشي'] },
  { slug: 'suzuki',     en: 'Suzuki',     ar: 'سوزوكي',     altEn: ['suzuki'], altAr: ['سوزوكي'] },
  { slug: 'isuzu',      en: 'Isuzu',      ar: 'إيسوزو',     altEn: ['isuzu'], altAr: ['إيسوزو','ايسوزو'] },
  { slug: 'subaru',     en: 'Subaru',     ar: 'سوبارو',     altEn: ['subaru'], altAr: ['سوبارو'] },
  { slug: 'daihatsu',   en: 'Daihatsu',   ar: 'دايهاتسو',   altEn: ['daihatsu'], altAr: ['دايهاتسو'] },
  { slug: 'lexus',      en: 'Lexus',      ar: 'لكزس',       altEn: ['lexus'], altAr: ['لكزس'] },
  { slug: 'infiniti',   en: 'Infiniti',   ar: 'إنفينيتي',   altEn: ['infiniti','infinity'], altAr: ['إنفينيتي','انفينيتي'] },

  // Korean
  { slug: 'hyundai', en: 'Hyundai', ar: 'هيونداي', altEn: ['hyundai'], altAr: ['هيونداي','هيونداى'] },
  { slug: 'kia',     en: 'Kia',     ar: 'كيا',     altEn: ['kia'],     altAr: ['كيا'] },
  { slug: 'genesis', en: 'Genesis', ar: 'جينيسيس', altEn: ['genesis'], altAr: ['جينيسيس'] },
  { slug: 'kgm',     en: 'KGM',     ar: 'كيه جي إم', altEn: ['kgm','ssangyong'], altAr: ['كي جي ام','كيه جي إم','سانج يونج'] },

  // German / European luxury & mainstream
  { slug: 'mercedes-benz', en: 'Mercedes-Benz', ar: 'مرسيدس بنز',
    altEn: ['mercedes-benz','mercedes benz','mercedes','m-b','mb','benz'],
    altAr: ['مرسيدس بنز','مرسيدس','مرسيدس-بنز'] },
  { slug: 'bmw',         en: 'BMW',          ar: 'بي إم دبليو',
    altEn: ['bmw','b m w','b.m.w','b-m-w'], altAr: ['بي إم دبليو','بي ام دبليو','بي.إم.دبليو'] },
  { slug: 'audi',        en: 'Audi',         ar: 'أودي',     altEn: ['audi'], altAr: ['أودي','اودي'] },
  { slug: 'volkswagen',  en: 'Volkswagen',   ar: 'فولكسفاجن', altEn: ['volkswagen','vw'], altAr: ['فولكسفاجن','فولكس فاجن','فولكسواجن'] },
  { slug: 'porsche',     en: 'Porsche',      ar: 'بورش',     altEn: ['porsche'], altAr: ['بورش','بورشه'] },
  { slug: 'mini',        en: 'MINI',         ar: 'ميني',     altEn: ['mini'], altAr: ['ميني'] },
  { slug: 'maybach',     en: 'Maybach',      ar: 'مايباخ',   altEn: ['maybach'], altAr: ['مايباخ'] },
  { slug: 'fiat',        en: 'Fiat',         ar: 'فيات',     altEn: ['fiat'], altAr: ['فيات'] },
  { slug: 'alfa-romeo',  en: 'Alfa Romeo',   ar: 'ألفا روميو', altEn: ['alfa-romeo','alfa romeo','alfa'], altAr: ['ألفا روميو','الفا روميو'] },
  { slug: 'maserati',    en: 'Maserati',     ar: 'مازيراتي', altEn: ['maserati'], altAr: ['مازيراتي','ماسيراتي'] },
  { slug: 'ferrari',     en: 'Ferrari',      ar: 'فيراري',   altEn: ['ferrari'], altAr: ['فيراري'] },
  { slug: 'lamborghini', en: 'Lamborghini',  ar: 'لامبورغيني', altEn: ['lamborghini'], altAr: ['لامبورغيني','لامبورجيني'] },
  { slug: 'bentley',     en: 'Bentley',      ar: 'بنتلي',    altEn: ['bentley'], altAr: ['بنتلي','بنتلى'] },
  { slug: 'rolls-royce', en: 'Rolls-Royce',  ar: 'رولز رويس', altEn: ['rolls-royce','rolls royce','rr'], altAr: ['رولز رويس','رولز-رويس'] },
  { slug: 'aston-martin',en: 'Aston Martin', ar: 'أستون مارتن', altEn: ['aston-martin','aston martin','aston'], altAr: ['أستون مارتن','استون مارتن'] },
  { slug: 'mclaren',     en: 'McLaren',      ar: 'مكلارين',  altEn: ['mclaren'], altAr: ['مكلارين','ماكلارين'] },
  { slug: 'lotus',       en: 'Lotus',        ar: 'لوتس',     altEn: ['lotus'], altAr: ['لوتس'] },
  { slug: 'volvo',       en: 'Volvo',        ar: 'فولفو',    altEn: ['volvo'], altAr: ['فولفو'] },
  { slug: 'jaguar',      en: 'Jaguar',       ar: 'جاكوار',   altEn: ['jaguar'], altAr: ['جاكوار','جاجوار'] },
  { slug: 'peugeot',     en: 'Peugeot',      ar: 'بيجو',     altEn: ['peugeot'], altAr: ['بيجو','بيجوت'] },
  { slug: 'renault',     en: 'Renault',      ar: 'رينو',     altEn: ['renault'], altAr: ['رينو','رنو'] },
  { slug: 'citroen',     en: 'Citroën',      ar: 'سيتروين',  altEn: ['citroen','citroën'], altAr: ['سيتروين'] },
  { slug: 'skoda',       en: 'Škoda',        ar: 'سكودا',    altEn: ['skoda','škoda'], altAr: ['سكودا'] },

  // British
  { slug: 'land-rover',  en: 'Land Rover', ar: 'لاند روفر',
    altEn: ['land-rover','land rover','range-rover','range rover','defender','range'],
    altAr: ['لاند روفر','لاندروفر','رينج روفر'] },
  { slug: 'ineos',       en: 'INEOS',      ar: 'اينيوس',     altEn: ['ineos'], altAr: ['اينيوس'] },

  // American
  { slug: 'ford',       en: 'Ford',       ar: 'فورد',       altEn: ['ford'], altAr: ['فورد'] },
  { slug: 'chevrolet',  en: 'Chevrolet',  ar: 'شفروليه',
    altEn: ['chevrolet','chevy','chev'], altAr: ['شفروليه','شيفروليه','شيفورلية','شيفروليت'] },
  { slug: 'gmc',        en: 'GMC',        ar: 'جي إم سي',   altEn: ['gmc'], altAr: ['جي إم سي','جي ام سي'] },
  { slug: 'cadillac',   en: 'Cadillac',   ar: 'كاديلاك',    altEn: ['cadillac'], altAr: ['كاديلاك','كادلاك'] },
  { slug: 'buick',      en: 'Buick',      ar: 'بيوك',       altEn: ['buick'], altAr: ['بيوك'] },
  { slug: 'lincoln',    en: 'Lincoln',    ar: 'لينكون',     altEn: ['lincoln'], altAr: ['لينكون'] },
  { slug: 'jeep',       en: 'Jeep',       ar: 'جيب',        altEn: ['jeep'], altAr: ['جيب'] },
  { slug: 'dodge',      en: 'Dodge',      ar: 'دودج',       altEn: ['dodge'], altAr: ['دودج'] },
  { slug: 'chrysler',   en: 'Chrysler',   ar: 'كرايسلر',    altEn: ['chrysler'], altAr: ['كرايسلر','كريزلر'] },
  { slug: 'ram',        en: 'Ram',        ar: 'رام',        altEn: ['ram'], altAr: ['رام'] },
  { slug: 'hummer',     en: 'Hummer',     ar: 'همر',        altEn: ['hummer'], altAr: ['همر','هامر'] },
  { slug: 'tesla',      en: 'Tesla',      ar: 'تيسلا',      altEn: ['tesla'], altAr: ['تيسلا'] },
  { slug: 'lucid',      en: 'Lucid',      ar: 'لوسيد',      altEn: ['lucid'], altAr: ['لوسيد'] },
  { slug: 'mercury',    en: 'Mercury',    ar: 'ميركوري',    altEn: ['mercury'], altAr: ['ميركوري'] },

  // Chinese
  { slug: 'changan',  en: 'Changan',  ar: 'شانجان',     altEn: ['changan'], altAr: ['شانجان','شنغان'] },
  { slug: 'jetour',   en: 'Jetour',   ar: 'جيتور',      altEn: ['jetour'], altAr: ['جيتور'] },
  { slug: 'geely',    en: 'Geely',    ar: 'جيلي',       altEn: ['geely'], altAr: ['جيلي'] },
  { slug: 'mg',       en: 'MG',       ar: 'إم جي',      altEn: ['mg','m-g','mg3'], altAr: ['إم جي','ام جي','إم.جي'] },
  { slug: 'haval',    en: 'Haval',    ar: 'هافال',      altEn: ['haval'], altAr: ['هافال'] },
  { slug: 'great-wall',en:'Great Wall',ar:'جريت وول',    altEn: ['great-wall','great wall','gwm'], altAr: ['جريت وول','جرايت وول'] },
  { slug: 'tank',     en: 'Tank',     ar: 'تانك',       altEn: ['tank'], altAr: ['تانك'] },
  { slug: 'gac',      en: 'GAC',      ar: 'جي إيه سي',  altEn: ['gac'], altAr: ['جي إيه سي','جي ايه سي','جاك'] },
  { slug: 'chery',    en: 'Chery',    ar: 'شيري',       altEn: ['chery'], altAr: ['شيري'] },
  { slug: 'byd',      en: 'BYD',      ar: 'بي واي دي',  altEn: ['byd'], altAr: ['بي واي دي','بى واى دى'] },
  { slug: 'faw',      en: 'FAW',      ar: 'فاو',        altEn: ['faw','faw-bestune'], altAr: ['فاو'] },
  { slug: 'bestune',  en: 'Bestune',  ar: 'بستيون',     altEn: ['bestune'], altAr: ['بستيون','بيستون'] },
  { slug: 'dongfeng', en: 'DongFeng', ar: 'دونغ فينغ',  altEn: ['dongfeng','dong feng','dfm'], altAr: ['دونغ فينغ','دونج فينج'] },
  { slug: 'jac',      en: 'JAC',      ar: 'جاك',        altEn: ['jac'], altAr: ['جاك'] },
  { slug: 'baic',     en: 'BAIC',     ar: 'بايك',       altEn: ['baic'], altAr: ['بايك'] },
  { slug: 'baw',      en: 'BAW',      ar: 'باو',        altEn: ['baw'], altAr: ['باو'] },
  { slug: 'maxus',    en: 'Maxus',    ar: 'ماكسوس',     altEn: ['maxus'], altAr: ['ماكسوس'] },
  { slug: 'hongqi',   en: 'Hongqi',   ar: 'هونشي',      altEn: ['hongqi'], altAr: ['هونشي','هونغ تشي'] },
  { slug: 'jaecoo',   en: 'Jaecoo',   ar: 'جايكو',      altEn: ['jaecoo'], altAr: ['جايكو'] },
  { slug: 'omoda',    en: 'Omoda',    ar: 'أوموده',     altEn: ['omoda'], altAr: ['أوموده','اوموده'] },
  { slug: 'exeed',    en: 'Exeed',    ar: 'إكسيد',      altEn: ['exeed'], altAr: ['إكسيد','اكسيد'] },
  { slug: 'rox',      en: 'ROX',      ar: 'روكس',       altEn: ['rox'], altAr: ['روكس'] },
  { slug: 'cmc',      en: 'CMC',      ar: 'سي إم سي',   altEn: ['cmc'], altAr: ['سي إم سي'] },
  { slug: 'forthing', en: 'Forthing', ar: 'فورثينج',    altEn: ['forthing'], altAr: ['فورثينج'] },
  { slug: 'foton',    en: 'Foton',    ar: 'فوتون',      altEn: ['foton'], altAr: ['فوتون'] },
  { slug: 'avatar',   en: 'Avatr',    ar: 'أفاتر',      altEn: ['avatar','avatr'], altAr: ['أفاتر'] },
  { slug: 'hiphi',    en: 'HiPhi',    ar: 'هايفاي',     altEn: ['hiphi'], altAr: ['هايفاي'] },
  { slug: 'lynk-co',  en: 'Lynk & Co',ar: 'لينك آند كو',
    altEn: ['lynk-co','link-and-co','lynk and co','lynk co','link and co'], altAr: ['لينك آند كو','لينك اند كو'] },
  { slug: 'deepal',   en: 'Deepal',   ar: 'ديبال',      altEn: ['deepal'], altAr: ['ديبال'] },
  { slug: 'zeeker',   en: 'Zeekr',    ar: 'زيكر',       altEn: ['zeeker','zeekr'], altAr: ['زيكر'] },
  { slug: 'xiaomi',   en: 'Xiaomi',   ar: 'شاومي',      altEn: ['xiaomi'], altAr: ['شاومي'] },
  { slug: 'soueast',  en: 'SOUEAST',  ar: 'سويست',      altEn: ['soueast'], altAr: ['سويست'] },
  { slug: 'kaiyi',    en: 'Kaiyi',    ar: 'كايي',       altEn: ['kaiyi'], altAr: ['كايي'] },
  { slug: 'lifan',    en: 'Lifan',    ar: 'ليفان',      altEn: ['lifan'], altAr: ['ليفان'] },
  { slug: 'skyworth', en: 'SkyWorth', ar: 'سكاي وورث',  altEn: ['skyworth'], altAr: ['سكاي وورث'] },
  { slug: 'tata',     en: 'Tata',     ar: 'تاتا',       altEn: ['tata'], altAr: ['تاتا'] },
]

// Models — Mercedes-Benz and BMW get aggressive consolidation since their
// model identifiers (S, E, C, 7, X) leaked into the data as single-letter
// model_slug values. Everything else mostly stays as-scraped, with light
// alternates for common typos / capitalization variants.
const MODELS = [
  // ── Mercedes-Benz ────────────────────────────────────────────────────────
  { make_slug: 'mercedes-benz', slug: 's-class', en: 'S-Class', ar: 'إس كلاس',
    altEn: ['s','s class','s-class','s500','s560','sel-500','450-sel','560-sl','s-500','sel500','s-560'] },
  { make_slug: 'mercedes-benz', slug: 'e-class', en: 'E-Class', ar: 'إي كلاس',
    altEn: ['e','e class','e-class','e300','e200','e350','e400'] },
  { make_slug: 'mercedes-benz', slug: 'c-class', en: 'C-Class', ar: 'سي كلاس',
    altEn: ['c','c class','c-class','c200','c300','c180','c350','clc-200'] },
  { make_slug: 'mercedes-benz', slug: 'a-class', en: 'A-Class', ar: 'إيه كلاس',
    altEn: ['a','a class','a-class','a200','a180','a45'] },
  { make_slug: 'mercedes-benz', slug: 'g-class', en: 'G-Class', ar: 'جي كلاس',
    altEn: ['g','g class','g-class','g63','g-63','g-63-amg','g500','g63-amg','g 63 amg'] },
  { make_slug: 'mercedes-benz', slug: 'v-class', en: 'V-Class', ar: 'في كلاس',
    altEn: ['v','v class','v-class','v250','v300'] },
  { make_slug: 'mercedes-benz', slug: 'gle', en: 'GLE', ar: 'جي إل إي',
    altEn: ['gle','gle-class','gle class','gle350','gle450','gle53','gle63'] },
  { make_slug: 'mercedes-benz', slug: 'glc', en: 'GLC', ar: 'جي إل سي',
    altEn: ['glc','glc-class','glc-200','glc200','glc300','glc43','glc63'] },
  { make_slug: 'mercedes-benz', slug: 'gls', en: 'GLS', ar: 'جي إل إس',
    altEn: ['gls','gls-class','gls450','gls63','gls600'] },
  { make_slug: 'mercedes-benz', slug: 'gla', en: 'GLA', ar: 'جي إل إيه',
    altEn: ['gla','gla-class','gla200','gla250'] },
  { make_slug: 'mercedes-benz', slug: 'glb', en: 'GLB', ar: 'جي إل بي', altEn: ['glb','glb-class'] },
  { make_slug: 'mercedes-benz', slug: 'cla', en: 'CLA', ar: 'سي إل إيه', altEn: ['cla','cla-class','cla200','cla45'] },
  { make_slug: 'mercedes-benz', slug: 'cls', en: 'CLS', ar: 'سي إل إس', altEn: ['cls','cls-class','cls53','cls63'] },
  { make_slug: 'mercedes-benz', slug: 'cle', en: 'CLE', ar: 'سي إل إي', altEn: ['cle','cle-class'] },
  { make_slug: 'mercedes-benz', slug: 'amg-gt', en: 'AMG GT', ar: 'إيه إم جي جي تي', altEn: ['gt','amg-gt','amg gt'] },
  { make_slug: 'mercedes-benz', slug: 'sl', en: 'SL', ar: 'إس إل', altEn: ['sl','sl-class','sl500'] },

  // ── BMW ──────────────────────────────────────────────────────────────────
  { make_slug: 'bmw', slug: '1-series', en: '1 Series', ar: 'الفئة الأولى',  altEn: ['1','1 series','1-series'] },
  { make_slug: 'bmw', slug: '2-series', en: '2 Series', ar: 'الفئة الثانية', altEn: ['2','2 series','2-series'] },
  { make_slug: 'bmw', slug: '3-series', en: '3 Series', ar: 'الفئة الثالثة', altEn: ['3','3 series','3-series'] },
  { make_slug: 'bmw', slug: '4-series', en: '4 Series', ar: 'الفئة الرابعة', altEn: ['4','4 series','4-series'] },
  { make_slug: 'bmw', slug: '5-series', en: '5 Series', ar: 'الفئة الخامسة', altEn: ['5','5 series','5-series','520','530','540'] },
  { make_slug: 'bmw', slug: '6-series', en: '6 Series', ar: 'الفئة السادسة', altEn: ['6','6 series','6-series'] },
  { make_slug: 'bmw', slug: '7-series', en: '7 Series', ar: 'الفئة السابعة', altEn: ['7','7 series','7-series','735','740','750','760'] },
  { make_slug: 'bmw', slug: '8-series', en: '8 Series', ar: 'الفئة الثامنة', altEn: ['8','8 series','8-series'] },
  { make_slug: 'bmw', slug: 'x1', en: 'X1', ar: 'إكس 1', altEn: ['x1'] },
  { make_slug: 'bmw', slug: 'x2', en: 'X2', ar: 'إكس 2', altEn: ['x2'] },
  { make_slug: 'bmw', slug: 'x3', en: 'X3', ar: 'إكس 3', altEn: ['x3'] },
  { make_slug: 'bmw', slug: 'x4', en: 'X4', ar: 'إكس 4', altEn: ['x4'] },
  { make_slug: 'bmw', slug: 'x5', en: 'X5', ar: 'إكس 5', altEn: ['x5'] },
  { make_slug: 'bmw', slug: 'x6', en: 'X6', ar: 'إكس 6', altEn: ['x6'] },
  { make_slug: 'bmw', slug: 'x7', en: 'X7', ar: 'إكس 7', altEn: ['x7'] },
  { make_slug: 'bmw', slug: 'xm', en: 'XM', ar: 'إكس إم', altEn: ['xm'] },
  { make_slug: 'bmw', slug: 'x-series', en: 'X Series', ar: 'سلسلة إكس',
    altEn: ['x series','x-series'] },  // generic catch-all when no specific X-N captured
  { make_slug: 'bmw', slug: 'm-series', en: 'M Series', ar: 'سلسلة إم',
    altEn: ['m','m series','m-series','m3','m4','m5','m8'] },
  { make_slug: 'bmw', slug: 'i-series', en: 'i Series', ar: 'سلسلة آي',
    altEn: ['i','i series','i-series','i3','i4','i7','i8','ix','ix3'] },
  { make_slug: 'bmw', slug: 'z4', en: 'Z4', ar: 'زد 4', altEn: ['z4','z-4'] },

  // ── Toyota ───────────────────────────────────────────────────────────────
  { make_slug: 'toyota', slug: 'land-cruiser', en: 'Land Cruiser', ar: 'لاندكروزر',
    altEn: ['land-cruiser','land cruiser','landcruiser','lc'] },
  { make_slug: 'toyota', slug: 'land-cruiser-prado', en: 'Land Cruiser Prado', ar: 'لاندكروزر برادو',
    altEn: ['land-cruiser-prado','land cruiser prado','prado','lc-prado'] },
  { make_slug: 'toyota', slug: 'camry', en: 'Camry', ar: 'كامري', altEn: ['camry'] },
  { make_slug: 'toyota', slug: 'corolla', en: 'Corolla', ar: 'كورولا', altEn: ['corolla'] },
  { make_slug: 'toyota', slug: 'corolla-cross', en: 'Corolla Cross', ar: 'كورولا كروس', altEn: ['corolla-cross','corolla cross'] },
  { make_slug: 'toyota', slug: 'yaris', en: 'Yaris', ar: 'يارس', altEn: ['yaris'] },
  { make_slug: 'toyota', slug: 'yaris-sedan', en: 'Yaris Sedan', ar: 'يارس سيدان', altEn: ['yaris-sedan','yaris sedan'] },
  { make_slug: 'toyota', slug: 'fortuner', en: 'Fortuner', ar: 'فورتشنر', altEn: ['fortuner'] },
  { make_slug: 'toyota', slug: 'hilux', en: 'Hilux', ar: 'هايلكس', altEn: ['hilux','hi-lux'] },
  { make_slug: 'toyota', slug: 'rav4', en: 'RAV4', ar: 'راف 4', altEn: ['rav4','rav-4','rav 4'] },
  { make_slug: 'toyota', slug: 'fj-cruiser', en: 'FJ Cruiser', ar: 'إف جي كروزر', altEn: ['fj-cruiser','fj cruiser','fj'] },
  { make_slug: 'toyota', slug: 'innova', en: 'Innova', ar: 'إنوفا', altEn: ['innova'] },
  { make_slug: 'toyota', slug: 'rush', en: 'Rush', ar: 'راش', altEn: ['rush'] },
  { make_slug: 'toyota', slug: 'raize', en: 'Raize', ar: 'رايز', altEn: ['raize'] },
  { make_slug: 'toyota', slug: 'highlander', en: 'Highlander', ar: 'هايلاندر', altEn: ['highlander'] },
  { make_slug: 'toyota', slug: 'hiace', en: 'HiAce', ar: 'هاي إيس', altEn: ['hiace','hi-ace','haice'] },
  { make_slug: 'toyota', slug: 'crown', en: 'Crown', ar: 'كراون', altEn: ['crown'] },
  { make_slug: 'toyota', slug: 'avalon', en: 'Avalon', ar: 'أفالون', altEn: ['avalon'] },
  { make_slug: 'toyota', slug: 'sequoia', en: 'Sequoia', ar: 'سيكويا', altEn: ['sequoia'] },
  { make_slug: 'toyota', slug: 'supra', en: 'Supra', ar: 'سوبرا', altEn: ['supra'] },
  { make_slug: 'toyota', slug: 'urban-cruiser', en: 'Urban Cruiser', ar: 'أربن كروزر', altEn: ['urban-cruiser','urban cruiser'] },
  { make_slug: 'toyota', slug: 'veloz', en: 'Veloz', ar: 'فيلوز', altEn: ['veloz'] },

  // ── Hyundai ──────────────────────────────────────────────────────────────
  { make_slug: 'hyundai', slug: 'accent', en: 'Accent', ar: 'أكسنت', altEn: ['accent'] },
  { make_slug: 'hyundai', slug: 'elantra', en: 'Elantra', ar: 'النترا', altEn: ['elantra','avante'] },
  { make_slug: 'hyundai', slug: 'sonata', en: 'Sonata', ar: 'سوناتا', altEn: ['sonata'] },
  { make_slug: 'hyundai', slug: 'tucson', en: 'Tucson', ar: 'توسان', altEn: ['tucson'] },
  { make_slug: 'hyundai', slug: 'creta', en: 'Creta', ar: 'كريتا', altEn: ['creta'] },
  { make_slug: 'hyundai', slug: 'kona', en: 'Kona', ar: 'كونا', altEn: ['kona'] },
  { make_slug: 'hyundai', slug: 'santa-fe', en: 'Santa Fe', ar: 'سانتا في', altEn: ['santa-fe','santa fe','santafe'] },
  { make_slug: 'hyundai', slug: 'palisade', en: 'Palisade', ar: 'باليسيد', altEn: ['palisade'] },
  { make_slug: 'hyundai', slug: 'grand-i10', en: 'Grand i10', ar: 'جراند آي 10', altEn: ['grand-i10','grand i10','grand'] },
  { make_slug: 'hyundai', slug: 'azera', en: 'Azera', ar: 'أزيرا', altEn: ['azera'] },
  { make_slug: 'hyundai', slug: 'staria', en: 'Staria', ar: 'ستاريا', altEn: ['staria'] },
  { make_slug: 'hyundai', slug: 'venue', en: 'Venue', ar: 'فينيو', altEn: ['venue'] },
  { make_slug: 'hyundai', slug: 'h1', en: 'H1', ar: 'إتش 1', altEn: ['h1','h-1'] },
  { make_slug: 'hyundai', slug: 'grandeur', en: 'Grandeur', ar: 'جراندير', altEn: ['grandeur'] },

  // ── Kia ──────────────────────────────────────────────────────────────────
  { make_slug: 'kia', slug: 'sportage',  en: 'Sportage',  ar: 'سبورتاج', altEn: ['sportage'] },
  { make_slug: 'kia', slug: 'pegas',     en: 'Pegas',     ar: 'بيجاس',   altEn: ['pegas'] },
  { make_slug: 'kia', slug: 'cerato',    en: 'Cerato',    ar: 'سيراتو',  altEn: ['cerato'] },
  { make_slug: 'kia', slug: 'seltos',    en: 'Seltos',    ar: 'سيلتوس',  altEn: ['seltos'] },
  { make_slug: 'kia', slug: 'sonet',     en: 'Sonet',     ar: 'سونيت',   altEn: ['sonet'] },
  { make_slug: 'kia', slug: 'carnival',  en: 'Carnival',  ar: 'كرنفال',  altEn: ['carnival'] },
  { make_slug: 'kia', slug: 'carens',    en: 'Carens',    ar: 'كارينز',  altEn: ['carens'] },
  { make_slug: 'kia', slug: 'telluride', en: 'Telluride', ar: 'تيلورايد', altEn: ['telluride'] },
  { make_slug: 'kia', slug: 'sorento',   en: 'Sorento',   ar: 'سورنتو',  altEn: ['sorento'] },
  { make_slug: 'kia', slug: 'rio',       en: 'Rio',       ar: 'ريو',     altEn: ['rio'] },
  { make_slug: 'kia', slug: 'optima',    en: 'Optima',    ar: 'أوبتيما', altEn: ['optima'] },
  { make_slug: 'kia', slug: 'k3', en: 'K3', ar: 'كي 3', altEn: ['k3'] },
  { make_slug: 'kia', slug: 'k4', en: 'K4', ar: 'كي 4', altEn: ['k4'] },
  { make_slug: 'kia', slug: 'k5', en: 'K5', ar: 'كي 5', altEn: ['k5'] },
  { make_slug: 'kia', slug: 'k8', en: 'K8', ar: 'كي 8', altEn: ['k8'] },

  // ── Lexus ────────────────────────────────────────────────────────────────
  { make_slug: 'lexus', slug: 'lx',  en: 'LX',  ar: 'إل إكس',  altEn: ['lx','lx-570','lx-600','lx570','lx600','lx 570','lx 600'] },
  { make_slug: 'lexus', slug: 'gx',  en: 'GX',  ar: 'جي إكس',  altEn: ['gx','gx-460','gx460','gx-550','gx 460'] },
  { make_slug: 'lexus', slug: 'rx',  en: 'RX',  ar: 'آر إكس',  altEn: ['rx','rx-350','rx-450','rx350','rx450','rx 350'] },
  { make_slug: 'lexus', slug: 'nx',  en: 'NX',  ar: 'إن إكس',  altEn: ['nx','nx-300','nx-350'] },
  { make_slug: 'lexus', slug: 'ux',  en: 'UX',  ar: 'يو إكس',  altEn: ['ux'] },
  { make_slug: 'lexus', slug: 'es',  en: 'ES',  ar: 'إي إس',   altEn: ['es','es-350','es350','es 350','es-300'] },
  { make_slug: 'lexus', slug: 'is',  en: 'IS',  ar: 'آي إس',   altEn: ['is','is-300','is-350'] },
  { make_slug: 'lexus', slug: 'ls',  en: 'LS',  ar: 'إل إس',   altEn: ['ls','ls-500','ls-460'] },
  { make_slug: 'lexus', slug: 'lc',  en: 'LC',  ar: 'إل سي',   altEn: ['lc','lc-500'] },
  { make_slug: 'lexus', slug: 'rc',  en: 'RC',  ar: 'آر سي',   altEn: ['rc','rc-f'] },

  // ── Nissan ───────────────────────────────────────────────────────────────
  { make_slug: 'nissan', slug: 'patrol',    en: 'Patrol',    ar: 'باترول',    altEn: ['patrol'] },
  { make_slug: 'nissan', slug: 'sunny',     en: 'Sunny',     ar: 'صني',       altEn: ['sunny'] },
  { make_slug: 'nissan', slug: 'altima',    en: 'Altima',    ar: 'التيما',    altEn: ['altima'] },
  { make_slug: 'nissan', slug: 'x-trail',   en: 'X-Trail',   ar: 'إكستريل',   altEn: ['x-trail','xtrail','x trail'] },
  { make_slug: 'nissan', slug: 'pathfinder',en: 'Pathfinder',ar: 'باثفايندر', altEn: ['pathfinder'] },
  { make_slug: 'nissan', slug: 'kicks',     en: 'Kicks',     ar: 'كيكس',      altEn: ['kicks'] },
  { make_slug: 'nissan', slug: 'sentra',    en: 'Sentra',    ar: 'سنترا',     altEn: ['sentra'] },
  { make_slug: 'nissan', slug: 'maxima',    en: 'Maxima',    ar: 'ماكسيما',   altEn: ['maxima'] },
  { make_slug: 'nissan', slug: 'magnite',   en: 'Magnite',   ar: 'ماغنايت',   altEn: ['magnite'] },
  { make_slug: 'nissan', slug: 'urvan',     en: 'Urvan',     ar: 'أورفان',    altEn: ['urvan'] },
  { make_slug: 'nissan', slug: 'xterra',    en: 'Xterra',    ar: 'إكستيرا',   altEn: ['xterra'] },
  { make_slug: 'nissan', slug: 'pickup',    en: 'Pickup',    ar: 'بيك أب',    altEn: ['pickup'] },

  // ── Ford ─────────────────────────────────────────────────────────────────
  { make_slug: 'ford', slug: 'taurus',    en: 'Taurus',    ar: 'توروس',     altEn: ['taurus'] },
  { make_slug: 'ford', slug: 'territory', en: 'Territory', ar: 'تيريتوري',  altEn: ['territory'] },
  { make_slug: 'ford', slug: 'explorer',  en: 'Explorer',  ar: 'إكسبلورر',  altEn: ['explorer'] },
  { make_slug: 'ford', slug: 'expedition',en: 'Expedition',ar: 'إكسبيديشن', altEn: ['expedition'] },
  { make_slug: 'ford', slug: 'edge',      en: 'Edge',      ar: 'إيدج',      altEn: ['edge'] },
  { make_slug: 'ford', slug: 'mustang',   en: 'Mustang',   ar: 'موستانج',   altEn: ['mustang'] },
  { make_slug: 'ford', slug: 'everest',   en: 'Everest',   ar: 'إيفرست',    altEn: ['everest'] },
  { make_slug: 'ford', slug: 'bronco',    en: 'Bronco',    ar: 'برونكو',    altEn: ['bronco'] },
  { make_slug: 'ford', slug: 'ranger',    en: 'Ranger',    ar: 'رينجر',     altEn: ['ranger'] },
  { make_slug: 'ford', slug: 'escape',    en: 'Escape',    ar: 'إسكيب',     altEn: ['escape'] },
  { make_slug: 'ford', slug: 'f-150',     en: 'F-150',     ar: 'إف 150',    altEn: ['f-150','f150','f 150','f'] },

  // ── Chevrolet ────────────────────────────────────────────────────────────
  { make_slug: 'chevrolet', slug: 'tahoe',       en: 'Tahoe',      ar: 'تاهو',       altEn: ['tahoe'] },
  { make_slug: 'chevrolet', slug: 'suburban',    en: 'Suburban',   ar: 'سوبربان',    altEn: ['suburban'] },
  { make_slug: 'chevrolet', slug: 'silverado',   en: 'Silverado',  ar: 'سلفرادو',    altEn: ['silverado'] },
  { make_slug: 'chevrolet', slug: 'traverse',    en: 'Traverse',   ar: 'ترافيرس',    altEn: ['traverse'] },
  { make_slug: 'chevrolet', slug: 'captiva',     en: 'Captiva',    ar: 'كابتيفا',    altEn: ['captiva'] },
  { make_slug: 'chevrolet', slug: 'malibu',      en: 'Malibu',     ar: 'ماليبو',     altEn: ['malibu'] },
  { make_slug: 'chevrolet', slug: 'impala',      en: 'Impala',     ar: 'إمبالا',     altEn: ['impala'] },
  { make_slug: 'chevrolet', slug: 'cruze',       en: 'Cruze',      ar: 'كروز',       altEn: ['cruze'] },
  { make_slug: 'chevrolet', slug: 'groove',      en: 'Groove',     ar: 'جروف',       altEn: ['groove'] },
  { make_slug: 'chevrolet', slug: 'corvette',    en: 'Corvette',   ar: 'كورفيت',     altEn: ['corvette'] },
  { make_slug: 'chevrolet', slug: 'camaro',      en: 'Camaro',     ar: 'كمارو',      altEn: ['camaro'] },
  { make_slug: 'chevrolet', slug: 'trailblazer', en: 'Trailblazer',ar: 'ترايلبليزر', altEn: ['trailblazer'] },
  { make_slug: 'chevrolet', slug: 'spark',       en: 'Spark',      ar: 'سبارك',      altEn: ['spark'] },
  { make_slug: 'chevrolet', slug: 'aveo',        en: 'Aveo',       ar: 'افيو',       altEn: ['aveo'] },

  // ── GMC ──────────────────────────────────────────────────────────────────
  { make_slug: 'gmc', slug: 'yukon',  en: 'Yukon',  ar: 'يوكن',  altEn: ['yukon'] },
  { make_slug: 'gmc', slug: 'sierra', en: 'Sierra', ar: 'سييرا', altEn: ['sierra'] },
  { make_slug: 'gmc', slug: 'acadia', en: 'Acadia', ar: 'أكاديا',altEn: ['acadia'] },

  // ── Land Rover ───────────────────────────────────────────────────────────
  { make_slug: 'land-rover', slug: 'range-rover',          en: 'Range Rover',          ar: 'رينج روفر',          altEn: ['range-rover','range rover','range'] },
  { make_slug: 'land-rover', slug: 'range-rover-sport',    en: 'Range Rover Sport',    ar: 'رينج روفر سبورت',    altEn: ['range-rover-sport','range rover sport'] },
  { make_slug: 'land-rover', slug: 'range-rover-velar',    en: 'Range Rover Velar',    ar: 'رينج روفر فيلار',    altEn: ['range-rover-velar','velar'] },
  { make_slug: 'land-rover', slug: 'range-rover-evoque',   en: 'Range Rover Evoque',   ar: 'رينج روفر إيفوك',    altEn: ['range-rover-evoque','evoque'] },
  { make_slug: 'land-rover', slug: 'range-rover-autobiography', en: 'Range Rover Autobiography', ar: 'رينج روفر أوتوبيوغرافي', altEn: ['range-rover-autobiography','autobiography'] },
  { make_slug: 'land-rover', slug: 'defender',             en: 'Defender',             ar: 'ديفندر',             altEn: ['defender','defender-110','defender-90','defender 110'] },
  { make_slug: 'land-rover', slug: 'discovery',            en: 'Discovery',            ar: 'ديسكفري',            altEn: ['discovery','disco'] },

  // ── Jeep ─────────────────────────────────────────────────────────────────
  { make_slug: 'jeep', slug: 'wrangler',       en: 'Wrangler',       ar: 'رانجلر',         altEn: ['wrangler'] },
  { make_slug: 'jeep', slug: 'grand-cherokee', en: 'Grand Cherokee', ar: 'جراند شيروكي',   altEn: ['grand-cherokee','grand cherokee'] },
  { make_slug: 'jeep', slug: 'cherokee',       en: 'Cherokee',       ar: 'شيروكي',         altEn: ['cherokee'] },
  { make_slug: 'jeep', slug: 'compass',        en: 'Compass',        ar: 'كومباس',         altEn: ['compass'] },
  { make_slug: 'jeep', slug: 'gladiator',      en: 'Gladiator',      ar: 'جلادياتور',      altEn: ['gladiator'] },

  // ── Dodge ────────────────────────────────────────────────────────────────
  { make_slug: 'dodge', slug: 'charger',    en: 'Charger',    ar: 'تشارجر',    altEn: ['charger'] },
  { make_slug: 'dodge', slug: 'challenger', en: 'Challenger', ar: 'تشالنجر',   altEn: ['challenger'] },
  { make_slug: 'dodge', slug: 'durango',    en: 'Durango',    ar: 'دورانجو',   altEn: ['durango'] },
  { make_slug: 'dodge', slug: 'ram',        en: 'Ram',        ar: 'رام',       altEn: ['ram'] },

  // ── Chrysler ─────────────────────────────────────────────────────────────
  { make_slug: 'chrysler', slug: '300c', en: '300C', ar: '300 سي', altEn: ['300c','300','300-c'] },

  // ── Cadillac ─────────────────────────────────────────────────────────────
  { make_slug: 'cadillac', slug: 'escalade', en: 'Escalade', ar: 'إسكاليد', altEn: ['escalade'] },
  { make_slug: 'cadillac', slug: 'ct5',      en: 'CT5',      ar: 'سي تي 5', altEn: ['ct5'] },

  // ── Honda ────────────────────────────────────────────────────────────────
  { make_slug: 'honda', slug: 'accord',  en: 'Accord',  ar: 'أكورد',   altEn: ['accord'] },
  { make_slug: 'honda', slug: 'civic',   en: 'Civic',   ar: 'سيفيك',   altEn: ['civic'] },
  { make_slug: 'honda', slug: 'city',    en: 'City',    ar: 'سيتي',    altEn: ['city'] },
  { make_slug: 'honda', slug: 'cr-v',    en: 'CR-V',    ar: 'سي آر في',altEn: ['cr-v','crv','cr v'] },
  { make_slug: 'honda', slug: 'hr-v',    en: 'HR-V',    ar: 'إتش آر في',altEn: ['hr-v','hrv','hr v'] },
  { make_slug: 'honda', slug: 'zr-v',    en: 'ZR-V',    ar: 'زد آر في',altEn: ['zr-v','zrv','zr v'] },
  { make_slug: 'honda', slug: 'pilot',   en: 'Pilot',   ar: 'بايلوت',  altEn: ['pilot'] },
  { make_slug: 'honda', slug: 'odyssey', en: 'Odyssey', ar: 'أوديسي',  altEn: ['odyssey'] },

  // ── Mazda ────────────────────────────────────────────────────────────────
  { make_slug: 'mazda', slug: 'cx-3',  en: 'CX-3',  ar: 'سي إكس 3',  altEn: ['cx-3','cx3','cx 3'] },
  { make_slug: 'mazda', slug: 'cx-5',  en: 'CX-5',  ar: 'سي إكس 5',  altEn: ['cx-5','cx5','cx 5'] },
  { make_slug: 'mazda', slug: 'cx-9',  en: 'CX-9',  ar: 'سي إكس 9',  altEn: ['cx-9','cx9','cx 9'] },
  { make_slug: 'mazda', slug: 'cx-30', en: 'CX-30', ar: 'سي إكس 30', altEn: ['cx-30','cx30'] },
  { make_slug: 'mazda', slug: '3',     en: 'Mazda 3', ar: 'مازدا 3', altEn: ['3','mazda-3','mazda 3'] },
  { make_slug: 'mazda', slug: '6',     en: 'Mazda 6', ar: 'مازدا 6', altEn: ['6','mazda-6','mazda 6'] },

  // ── Mitsubishi ───────────────────────────────────────────────────────────
  { make_slug: 'mitsubishi', slug: 'pajero',  en: 'Pajero',  ar: 'باجيرو',   altEn: ['pajero'] },
  { make_slug: 'mitsubishi', slug: 'l200',    en: 'L200',    ar: 'إل 200',   altEn: ['l200','l-200'] },
  { make_slug: 'mitsubishi', slug: 'attrage', en: 'Attrage', ar: 'أتراج',    altEn: ['attrage'] },
  { make_slug: 'mitsubishi', slug: 'asx',     en: 'ASX',     ar: 'إيه إس إكس', altEn: ['asx'] },

  // ── Audi ─────────────────────────────────────────────────────────────────
  { make_slug: 'audi', slug: 'a3', en: 'A3', ar: 'إيه 3', altEn: ['a3'] },
  { make_slug: 'audi', slug: 'a4', en: 'A4', ar: 'إيه 4', altEn: ['a4'] },
  { make_slug: 'audi', slug: 'a5', en: 'A5', ar: 'إيه 5', altEn: ['a5'] },
  { make_slug: 'audi', slug: 'a6', en: 'A6', ar: 'إيه 6', altEn: ['a6'] },
  { make_slug: 'audi', slug: 'a7', en: 'A7', ar: 'إيه 7', altEn: ['a7'] },
  { make_slug: 'audi', slug: 'a8', en: 'A8', ar: 'إيه 8', altEn: ['a8','a8l'] },
  { make_slug: 'audi', slug: 'q3', en: 'Q3', ar: 'كيو 3', altEn: ['q3'] },
  { make_slug: 'audi', slug: 'q5', en: 'Q5', ar: 'كيو 5', altEn: ['q5'] },
  { make_slug: 'audi', slug: 'q7', en: 'Q7', ar: 'كيو 7', altEn: ['q7'] },
  { make_slug: 'audi', slug: 'q8', en: 'Q8', ar: 'كيو 8', altEn: ['q8'] },

  // ── Porsche ──────────────────────────────────────────────────────────────
  { make_slug: 'porsche', slug: 'cayenne',  en: 'Cayenne',  ar: 'كايين',     altEn: ['cayenne'] },
  { make_slug: 'porsche', slug: 'macan',    en: 'Macan',    ar: 'ماكان',     altEn: ['macan'] },
  { make_slug: 'porsche', slug: '911',      en: '911',      ar: '911',       altEn: ['911'] },
  { make_slug: 'porsche', slug: 'panamera', en: 'Panamera', ar: 'باناميرا',  altEn: ['panamera'] },
  { make_slug: 'porsche', slug: 'cayman',   en: 'Cayman',   ar: 'كايمان',    altEn: ['cayman'] },
  { make_slug: 'porsche', slug: '718',      en: '718',      ar: '718',       altEn: ['718'] },

  // ── Genesis ──────────────────────────────────────────────────────────────
  { make_slug: 'genesis', slug: 'g70', en: 'G70', ar: 'جي 70', altEn: ['g70'] },
  { make_slug: 'genesis', slug: 'g80', en: 'G80', ar: 'جي 80', altEn: ['g80'] },
  { make_slug: 'genesis', slug: 'g90', en: 'G90', ar: 'جي 90', altEn: ['g90'] },
  { make_slug: 'genesis', slug: 'gv70',en: 'GV70',ar: 'جي في 70', altEn: ['gv70'] },
  { make_slug: 'genesis', slug: 'gv80',en: 'GV80',ar: 'جي في 80', altEn: ['gv80'] },
  { make_slug: 'genesis', slug: 'g-series', en: 'G Series', ar: 'سلسلة جي', altEn: ['g','g series','g-series'] },
  { make_slug: 'genesis', slug: 'gv-series',en: 'GV Series',ar: 'سلسلة جي في', altEn: ['gv','gv series','gv-series'] },

  // ── Lincoln ──────────────────────────────────────────────────────────────
  { make_slug: 'lincoln', slug: 'nautilus',  en: 'Nautilus',  ar: 'نوتيلوس', altEn: ['nautilus'] },
  { make_slug: 'lincoln', slug: 'navigator', en: 'Navigator', ar: 'نافيجيتور', altEn: ['navigator'] },

  // ── Infiniti ─────────────────────────────────────────────────────────────
  { make_slug: 'infiniti', slug: 'qx-series', en: 'QX Series', ar: 'سلسلة كيو إكس', altEn: ['qx','qx series','qx-series','qx50','qx55','qx60','qx80'] },

  // ── BYD / Geely / Changan / Jetour / Haval / GAC / Chery (Chinese majors) ─
  { make_slug: 'byd', slug: 'seal',      en: 'Seal',      ar: 'سيل',     altEn: ['seal'] },
  { make_slug: 'byd', slug: 'song-plus', en: 'Song Plus', ar: 'سونغ بلس',altEn: ['song-plus','song plus'] },

  { make_slug: 'geely', slug: 'emgrand', en: 'Emgrand', ar: 'إمجراند', altEn: ['emgrand'] },
  { make_slug: 'geely', slug: 'tugella', en: 'Tugella', ar: 'توجيلا',  altEn: ['tugella'] },
  { make_slug: 'geely', slug: 'coolray', en: 'Coolray', ar: 'كولراي',  altEn: ['coolray'] },

  { make_slug: 'changan', slug: 'alsvin',    en: 'Alsvin',    ar: 'الزفين',   altEn: ['alsvin'] },
  { make_slug: 'changan', slug: 'eado',      en: 'Eado',      ar: 'إيدو',     altEn: ['eado'] },
  { make_slug: 'changan', slug: 'eado-plus', en: 'Eado Plus', ar: 'إيدو بلس', altEn: ['eado-plus','eado plus'] },
  { make_slug: 'changan', slug: 'cs35',      en: 'CS35',      ar: 'سي إس 35', altEn: ['cs35'] },
  { make_slug: 'changan', slug: 'cs35-plus', en: 'CS35 Plus', ar: 'سي إس 35 بلس', altEn: ['cs35-plus','cs35 plus'] },
  { make_slug: 'changan', slug: 'cs75',      en: 'CS75',      ar: 'سي إس 75', altEn: ['cs75'] },
  { make_slug: 'changan', slug: 'cs75-plus', en: 'CS75 Plus', ar: 'سي إس 75 بلس', altEn: ['cs75-plus'] },
  { make_slug: 'changan', slug: 'cs85',      en: 'CS85',      ar: 'سي إس 85', altEn: ['cs85'] },
  { make_slug: 'changan', slug: 'cs95',      en: 'CS95',      ar: 'سي إس 95', altEn: ['cs95'] },
  { make_slug: 'changan', slug: 'uni-v',     en: 'UNI-V',     ar: 'يوني في',  altEn: ['uni-v','uni v'] },
  { make_slug: 'changan', slug: 'uni-t',     en: 'UNI-T',     ar: 'يوني تي',  altEn: ['uni-t'] },
  { make_slug: 'changan', slug: 'uni-k',     en: 'UNI-K',     ar: 'يوني كي',  altEn: ['uni-k'] },
  { make_slug: 'changan', slug: 'uni-s',     en: 'UNI-S',     ar: 'يوني إس',  altEn: ['uni-s'] },
  { make_slug: 'changan', slug: 'hunter',    en: 'Hunter',    ar: 'هانتر',    altEn: ['hunter'] },

  { make_slug: 'jetour', slug: 't1',       en: 'T1',       ar: 'تي 1',     altEn: ['t1'] },
  { make_slug: 'jetour', slug: 't2',       en: 'T2',       ar: 'تي 2',     altEn: ['t2'] },
  { make_slug: 'jetour', slug: 'x50',      en: 'X50',      ar: 'إكس 50',   altEn: ['x50'] },
  { make_slug: 'jetour', slug: 'x70',      en: 'X70',      ar: 'إكس 70',   altEn: ['x70'] },
  { make_slug: 'jetour', slug: 'x70-plus', en: 'X70 Plus', ar: 'إكس 70 بلس', altEn: ['x70-plus','x70 plus'] },
  { make_slug: 'jetour', slug: 'dashing',  en: 'Dashing',  ar: 'داشينج',   altEn: ['dashing'] },
  { make_slug: 'jetour', slug: 'g700',     en: 'G700',     ar: 'جي 700',   altEn: ['g700'] },

  { make_slug: 'haval', slug: 'h6',     en: 'H6',     ar: 'إتش 6',  altEn: ['h6'] },
  { make_slug: 'haval', slug: 'h9',     en: 'H9',     ar: 'إتش 9',  altEn: ['h9'] },
  { make_slug: 'haval', slug: 'jolion', en: 'Jolion', ar: 'جوليون', altEn: ['jolion'] },

  { make_slug: 'gac', slug: 'gs3',   en: 'GS3',   ar: 'جي إس 3',  altEn: ['gs3'] },
  { make_slug: 'gac', slug: 'gs8',   en: 'GS8',   ar: 'جي إس 8',  altEn: ['gs8'] },
  { make_slug: 'gac', slug: 'empow', en: 'Empow', ar: 'إمباو',    altEn: ['empow'] },

  { make_slug: 'chery', slug: 'arrizo', en: 'Arrizo', ar: 'أريزو', altEn: ['arrizo'] },
  { make_slug: 'chery', slug: 'tiggo',  en: 'Tiggo',  ar: 'تيغو',  altEn: ['tiggo'] },

  { make_slug: 'mg', slug: 'zs',  en: 'ZS',  ar: 'زد إس', altEn: ['zs','mg-zs','mg zs'] },
  { make_slug: 'mg', slug: '5',   en: 'MG 5',ar: 'إم جي 5', altEn: ['5','mg-5','mg 5'] },
  { make_slug: 'mg', slug: 'rx5', en: 'RX5', ar: 'آر إكس 5', altEn: ['rx5'] },
  { make_slug: 'mg', slug: 'gt',  en: 'GT',  ar: 'جي تي',  altEn: ['gt'] },

  // ── Suzuki ───────────────────────────────────────────────────────────────
  { make_slug: 'suzuki', slug: 'dzire',  en: 'Dzire',  ar: 'ديزاير',  altEn: ['dzire'] },
  { make_slug: 'suzuki', slug: 'baleno', en: 'Baleno', ar: 'بالينو',  altEn: ['baleno'] },
  { make_slug: 'suzuki', slug: 'jimny',  en: 'Jimny',  ar: 'جيمني',   altEn: ['jimny'] },
  { make_slug: 'suzuki', slug: 'ertiga', en: 'Ertiga', ar: 'إرتيجا',  altEn: ['ertiga'] },
  { make_slug: 'suzuki', slug: 'swift',  en: 'Swift',  ar: 'سويفت',   altEn: ['swift'] },
  { make_slug: 'suzuki', slug: 'ciaz',   en: 'Ciaz',   ar: 'سياز',    altEn: ['ciaz'] },

  // ── Isuzu ────────────────────────────────────────────────────────────────
  { make_slug: 'isuzu', slug: 'd-max', en: 'D-Max', ar: 'دي ماكس', altEn: ['d-max','dmax','d max'] },
  { make_slug: 'isuzu', slug: 'mu-x',  en: 'MU-X',  ar: 'إم يو إكس', altEn: ['mu-x','mux'] },
  { make_slug: 'isuzu', slug: 'dyna',  en: 'Dyna',  ar: 'داينا',     altEn: ['dyna'] },

  // ── Daihatsu ─────────────────────────────────────────────────────────────
  { make_slug: 'daihatsu', slug: 'terios', en: 'Terios', ar: 'تيريوس', altEn: ['terios'] },

  // ── Mini ─────────────────────────────────────────────────────────────────
  { make_slug: 'mini', slug: 'cooper',     en: 'Cooper',     ar: 'كوبر',     altEn: ['cooper'] },
  { make_slug: 'mini', slug: 'countryman', en: 'Countryman', ar: 'كنتري مان', altEn: ['countryman','country-man','country man'] },

  // ── Rolls-Royce / Bentley / Aston / Lambo / Ferrari (luxury models) ──────
  { make_slug: 'rolls-royce', slug: 'ghost',    en: 'Ghost',    ar: 'جوست',    altEn: ['ghost'] },
  { make_slug: 'rolls-royce', slug: 'wraith',   en: 'Wraith',   ar: 'رايث',    altEn: ['wraith'] },
  { make_slug: 'rolls-royce', slug: 'cullinan', en: 'Cullinan', ar: 'كولينان', altEn: ['cullinan'] },

  { make_slug: 'bentley', slug: 'bentayga',                en: 'Bentayga',                ar: 'بنتايجا',                altEn: ['bentayga'] },
  { make_slug: 'bentley', slug: 'continental-gt',          en: 'Continental GT',          ar: 'كونتيننتال جي تي',       altEn: ['continental-gt','continental gt'] },
  { make_slug: 'bentley', slug: 'continental-flying-spur', en: 'Continental Flying Spur', ar: 'كونتيننتال فلاينج سبور', altEn: ['continental-flying-spur','flying-spur','flying spur'] },
  { make_slug: 'bentley', slug: 'mulsanne',                en: 'Mulsanne',                ar: 'مولسان',                 altEn: ['mulsanne'] },

  { make_slug: 'lamborghini', slug: 'urus',      en: 'Urus',      ar: 'أوروس',   altEn: ['urus'] },
  { make_slug: 'lamborghini', slug: 'huracan',   en: 'Huracán',   ar: 'هوراكان', altEn: ['huracan','huracán','huracn'] },
  { make_slug: 'lamborghini', slug: 'aventador', en: 'Aventador', ar: 'أفنتادور',altEn: ['aventador'] },

  { make_slug: 'maserati', slug: 'levante', en: 'Levante', ar: 'ليفانتي', altEn: ['levante'] },
  { make_slug: 'maserati', slug: 'ghibli',  en: 'Ghibli',  ar: 'غيبلي',   altEn: ['ghibli'] },
  { make_slug: 'maserati', slug: 'grecale', en: 'Grecale', ar: 'جريكالي', altEn: ['grecale'] },

  { make_slug: 'jaguar', slug: 'f-pace', en: 'F-Pace', ar: 'إف بيس', altEn: ['f-pace','fpace'] },
  { make_slug: 'jaguar', slug: 'e-pace', en: 'E-Pace', ar: 'إي بيس', altEn: ['e-pace','epace'] },
  { make_slug: 'jaguar', slug: 'f-type', en: 'F-Type', ar: 'إف تايب', altEn: ['f-type','ftype'] },

  // ── Tesla ────────────────────────────────────────────────────────────────
  { make_slug: 'tesla', slug: 'model-s', en: 'Model S', ar: 'موديل إس', altEn: ['model-s','model s'] },
  { make_slug: 'tesla', slug: 'model-3', en: 'Model 3', ar: 'موديل 3',  altEn: ['model-3','model 3'] },
  { make_slug: 'tesla', slug: 'model-x', en: 'Model X', ar: 'موديل إكس',altEn: ['model-x','model x'] },
  { make_slug: 'tesla', slug: 'model-y', en: 'Model Y', ar: 'موديل واي',altEn: ['model-y','model y'] },
  { make_slug: 'tesla', slug: 'cybertruck', en: 'Cybertruck', ar: 'سايبرتراك', altEn: ['cybertruck'] },

  // ── Lucid ────────────────────────────────────────────────────────────────
  { make_slug: 'lucid', slug: 'air', en: 'Air', ar: 'إير', altEn: ['air','air-pure','air pure'] },

  // ── Peugeot / Renault / Volkswagen / Volvo / Fiat ───────────────────────
  { make_slug: 'peugeot',    slug: '2008',     en: '2008',     ar: '2008',      altEn: ['2008'] },
  { make_slug: 'peugeot',    slug: '3008',     en: '3008',     ar: '3008',      altEn: ['3008'] },
  { make_slug: 'renault',    slug: 'duster',   en: 'Duster',   ar: 'داستر',     altEn: ['duster'] },
  { make_slug: 'renault',    slug: 'talisman', en: 'Talisman', ar: 'تاليسمان',  altEn: ['talisman'] },
  { make_slug: 'volkswagen', slug: 'teramont', en: 'Teramont', ar: 'تيرامونت',  altEn: ['teramont'] },
  { make_slug: 'volkswagen', slug: 'touareg',  en: 'Touareg',  ar: 'طوارق',     altEn: ['touareg'] },
  { make_slug: 'fiat',       slug: '500',      en: 'Fiat 500', ar: 'فيات 500',  altEn: ['500'] },
  { make_slug: 'fiat',       slug: 'abarth',   en: 'Abarth',   ar: 'أبارث',     altEn: ['abarth'] },

  // ── DongFeng / JAC / FAW (Chinese commercial) ───────────────────────────
  { make_slug: 'dongfeng', slug: 'shine',   en: 'Shine',   ar: 'شاين',     altEn: ['shine'] },
  { make_slug: 'jac',      slug: 'm1',      en: 'M1',      ar: 'إم 1',     altEn: ['m1'] },
  { make_slug: 'cmc',      slug: 'veryca',  en: 'Veryca',  ar: 'فيريكا',   altEn: ['veryca'] },

  // ── BAW (212 model) ──────────────────────────────────────────────────────
  { make_slug: 'baw', slug: '212', en: '212', ar: '212', altEn: ['212'] },

  // ── ROX ──────────────────────────────────────────────────────────────────
  { make_slug: 'rox', slug: '01', en: 'ROX 01', ar: 'روكس 01', altEn: ['01','rox-01'] },
]

module.exports = { MAKES, MODELS }
