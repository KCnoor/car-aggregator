'use strict'
// Source-quality tier mapping used by baselines (weighted median) and by the
// low_source_confidence signal in scoring. Single source of truth — do NOT
// duplicate this CASE expression anywhere else; the SQL backfill in
// supabase/migrate-v4.sql mirrors these values.

const TIER_1 = new Set(['syarah', 'soum', 'carswitch', 'digitalcar'])
const TIER_2 = new Set(['motory', 'yallamotor', 'gogomotor'])
// Everything else (saudisale, dubizzle, haraj, carly, …) is tier 3.

function sourceToTier (source) {
  if (TIER_1.has(source)) return 1
  if (TIER_2.has(source)) return 2
  return 3
}

const TIER_WEIGHT = { 1: 3, 2: 2, 3: 1 }
function tierWeight (tier) { return TIER_WEIGHT[tier] ?? 1 }

module.exports = { sourceToTier, tierWeight }
