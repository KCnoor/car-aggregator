'use strict'
// fix-gogomotor-photos.js — migrate gogomotor photo URLs from old /listing/ to /assets/listing/
// Run: SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/fix-gogomotor-photos.js

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jmfoeziomchpwanuziqm.supabase.co'
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

;(async () => {
  // Fetch all gogomotor listings that have old-format photo URLs
  const { data, error } = await sb
    .from('listings')
    .select('id, photo_urls')
    .eq('source', 'gogomotor')
    .not('photo_urls', 'is', null)

  if (error) { console.error('Fetch error:', error.message); process.exit(1) }
  console.log(`Fetched ${data.length} gogomotor listings`)

  let fixed = 0
  const updates = []

  for (const row of data) {
    const newUrls = (row.photo_urls || []).map(url => {
      if (typeof url === 'string' && url.includes('img.gogomotor.com/listing/')) {
        return url.replace('img.gogomotor.com/listing/', 'img.gogomotor.com/assets/listing/')
      }
      return url
    })
    const changed = JSON.stringify(newUrls) !== JSON.stringify(row.photo_urls)
    if (changed) {
      updates.push({ id: row.id, photo_urls: newUrls })
      fixed++
    }
  }

  console.log(`${fixed} rows need updating`)
  if (fixed === 0) { console.log('Nothing to do.'); return }

  // Batch update in chunks of 100
  const CHUNK = 100
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK)
    for (const upd of chunk) {
      const { error: e } = await sb
        .from('listings')
        .update({ photo_urls: upd.photo_urls })
        .eq('id', upd.id)
      if (e) console.error(`Update failed for ${upd.id}:`, e.message)
    }
    console.log(`Updated ${Math.min(i + CHUNK, updates.length)}/${updates.length}`)
  }

  console.log(`Done — ${fixed} gogomotor photo URLs migrated to /assets/listing/ path`)
})()
