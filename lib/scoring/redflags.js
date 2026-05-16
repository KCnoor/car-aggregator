'use strict'
// Red-flag detection — single source of truth. Used by Layer 2 (normalize)
// at write-time and re-checked by Layer 4 (score) for safety. Any detected
// flag caps the final deal_score at 5.0.
//
// Pattern list combines what previously lived in scripts/ai-valuation.js and
// scripts/plausibility-check.js. The latter was missing side_impact and
// airbag_deployed — fixed here. Also adds explicit Arabic/English variants
// for "no insurance" per the v2 refactor spec.

const RED_FLAG_PATTERNS = [
  { re: /حادث|مصدوم|تصادم/,                              label: 'accident'             },
  { re: /airbag(s)?\s*deployed|airbag|air\s*bag/i,        label: 'airbag_deployed'      },
  { re: /side\s*impact(s)?|اصطدام\s*جانبي|جانبي/i,       label: 'side_impact'          },
  { re: /محرك\s*معاد|محرك\s*مجدد|engine\s*overhauled?|overhauled/i, label: 'engine_overhauled' },
  { re: /استمارة\s*منتهية?|expired\s*registration|expired\s*reg\b/i, label: 'expired_registration' },
  { re: /تأمين\s*منتهي|expired\s*insurance|expired\s*ins\b|no\s*insurance|بدون\s*تأمين/i, label: 'expired_or_no_insurance' },
  { re: /وفاة|توفي|متوفي|ورث|ميراث|inheritance|deceased/i, label: 'deceased_owner'    },
  { re: /\bdamaged?\b|تالف|متضرر/i,                       label: 'damage'               },
  { re: /salvage|شطب|تشطيب/i,                             label: 'salvage'              },
  { re: /\bمجدد\b|\bمطلي\b|respray(ed)?\b|repainted?/i,   label: 'repainted'            },
  { re: /fender\s*repair|إصلاح\s*رفرف|إصلاح\s*صدام/i,    label: 'fender_repair'        },
]

const MILEAGE_RED_FLAG_KM = 300000

function detectFromText (text) {
  if (!text) return []
  const found = []
  for (const { re, label } of RED_FLAG_PATTERNS) {
    if (re.test(text)) found.push(label)
  }
  return Array.from(new Set(found))
}

// Detects flags from a listing row. Combines description, title, mileage.
// Pass either a normalized listing (description_ar/title/mileage_km) or a raw
// blob with the same fields.
function detect (listing) {
  if (!listing) return []
  const text = `${listing.description_ar ?? ''} ${listing.title ?? ''} ${listing.description ?? ''}`
  const flags = detectFromText(text)
  if ((listing.mileage_km ?? 0) > MILEAGE_RED_FLAG_KM) flags.push('very_high_mileage')
  return Array.from(new Set(flags))
}

// Cap a score at 5.0 if any red flag is present. Returns the capped score
// and the penalty (original - capped, ≥ 0).
function applyCap (score, flags) {
  if (!flags || flags.length === 0) return { score, penalty: 0 }
  const capped = Math.min(score, 5.0)
  return { score: capped, penalty: Math.max(0, score - capped) }
}

module.exports = {
  RED_FLAG_PATTERNS,
  MILEAGE_RED_FLAG_KM,
  detect,
  detectFromText,
  applyCap,
}
