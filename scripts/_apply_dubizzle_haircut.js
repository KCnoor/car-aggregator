'use strict'
// One-shot: apply Dubizzle -1.3 score haircut to all already-scored Dubizzle
// listings. Floor 0, cap 10. Updates both deal_score and deal_score_v2 so
// the live site reflects the haircut immediately without re-running score.

const fs = require('fs')
for (const line of fs.readFileSync('/Users/kaisinoureddin/car-aggregator/.env.local','utf8').split(/\r?\n/)) {
  const m = line.replace(/^export\s+/, '').trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
}
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const { createClient } = require('/Users/kaisinoureddin/car-aggregator/node_modules/@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const tiers = require('/Users/kaisinoureddin/car-aggregator/lib/scoring/tiers')

;(async () => {
  const adj = tiers.sourceScoreAdjustment('dubizzle')
  console.log('Dubizzle adjustment:', adj)
  const { data, error } = await sb.from('listings')
    .select('id, deal_score, deal_score_v2')
    .eq('source', 'dubizzle')
    .not('deal_score', 'is', null)
  if (error) throw error
  console.log(`Found ${data.length} Dubizzle scored listings`)

  let updated = 0
  for (let i = 0; i < data.length; i += 20) {
    const batch = data.slice(i, i + 20)
    await Promise.all(batch.map(async (l) => {
      const newScore = Math.round(Math.max(0, Math.min(10, l.deal_score + adj)) * 10) / 10
      const newScoreV2 = l.deal_score_v2 != null
        ? Math.round(Math.max(0, Math.min(10, l.deal_score_v2 + adj)) * 10) / 10
        : null
      const { error: e } = await sb.from('listings').update({
        deal_score: newScore,
        deal_score_v2: newScoreV2,
      }).eq('id', l.id)
      if (!e) updated++
    }))
  }
  console.log(`updated: ${updated} / ${data.length}`)
})().catch(e => { console.error(e); process.exit(1) })
