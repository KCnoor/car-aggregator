// Curated preset bundles for الصياد. Each bundle is a 4-5 model set the
// user can click to instantly populate the chart. Make / model slugs MUST
// match the canonical slugs in canonical_makes / canonical_models so they
// resolve against the listings table.

export type Bundle = {
  id: string
  labelAr: string
  models: { make: string; model: string }[]
}

export const BUNDLES: Bundle[] = [
  {
    id: 'mid-japanese-sedan',
    labelAr: 'سيدان ياباني متوسط',
    models: [
      { make: 'toyota',  model: 'camry'   },
      { make: 'honda',   model: 'accord'  },
      { make: 'toyota',  model: 'avalon'  },
      { make: 'nissan',  model: 'altima'  },
      { make: 'mazda',   model: '6'       },
    ],
  },
  {
    id: 'seven-seat-family',
    labelAr: 'عائلية ٧ ركاب',
    models: [
      { make: 'nissan',     model: 'patrol'       },
      { make: 'toyota',     model: 'land-cruiser' },
      { make: 'gmc',        model: 'yukon'        },
      { make: 'chevrolet',  model: 'tahoe'        },
      { make: 'hyundai',    model: 'palisade'     },
    ],
  },
  {
    id: 'compact-hatchback',
    labelAr: 'هاتشباك اقتصادي',
    models: [
      { make: 'toyota',   model: 'yaris'    },
      { make: 'hyundai',  model: 'accent'   },
      { make: 'kia',      model: 'pegas'    },   // closest canonical match to Picanto
      { make: 'mg',       model: '5'        },
      { make: 'geely',    model: 'emgrand'  },
    ],
  },
  {
    id: 'off-roader',
    labelAr: 'أوف رود',
    models: [
      { make: 'jeep',    model: 'wrangler'            },
      { make: 'ford',    model: 'bronco'              },
      { make: 'suzuki',  model: 'jimny'               },
      { make: 'toyota',  model: 'land-cruiser-prado'  },
      { make: 'toyota',  model: 'fj-cruiser'          },
    ],
  },
  {
    id: 'korean-sedan',
    labelAr: 'سيدان كوري',
    models: [
      { make: 'hyundai',  model: 'sonata'  },
      { make: 'kia',      model: 'k5'      },
      { make: 'hyundai',  model: 'elantra' },
      { make: 'kia',      model: 'k3'      },   // Forte is sold as K3 in KSA
    ],
  },
  {
    id: 'chinese-suv',
    labelAr: 'SUV صيني',
    models: [
      { make: 'geely',    model: 'coolray' },
      { make: 'mg',       model: 'zs'      },   // closest canonical match to HS
      { make: 'gac',      model: 'gs3'     },
      { make: 'gac',      model: 'gs8'     },
      { make: 'changan',  model: 'cs35'    },
    ],
  },
  {
    id: 'luxury-sedan',
    labelAr: 'فخامة سيدان',
    models: [
      { make: 'mercedes-benz', model: 'e-class' },
      { make: 'bmw',           model: '5-series' },
      { make: 'audi',          model: 'a6'      },
      { make: 'lexus',         model: 'es'      },
      { make: 'genesis',       model: 'g80'     },
    ],
  },
  {
    id: 'american-pickup',
    labelAr: 'بيك أب أمريكي',
    models: [
      { make: 'ford',       model: 'f-150'     },
      { make: 'chevrolet',  model: 'silverado' },
      { make: 'dodge',      model: 'ram'       },   // RAM 1500 still lives under Dodge in our slug system
      { make: 'toyota',     model: 'hilux'     },   // KSA pickup substitute for Tundra (rarely listed)
    ],
  },
]

// Per-model swatch palette — assigned in order of selection (max 5 models).
// Picked to be distinguishable to color-blind users.
export const MODEL_COLORS = [
  '#FF6B4A',  // coral
  '#10B981',  // emerald
  '#8B5CF6',  // violet
  '#F59E0B',  // amber
  '#3B82F6',  // blue
]
