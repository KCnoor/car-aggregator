'use strict'
// Shared raw_listings writer. Used by every scraper.
//
// - Buffers rows in memory; flushes in batches of `flushEvery` (default 50)
//   to balance throughput against partial-loss windows.
// - Idempotent on (source, source_id) via Supabase upsert. The unique index
//   on raw_listings_source_id (created in migrate-v4) backs the conflict
//   target.
// - Writes INCREMENTALLY — never accumulates the whole run before flushing.
//   This is the "partial-failure handling" requirement: if a scraper crashes
//   mid-run, all rows captured so far are already persisted.

const fs   = require('fs')
const path = require('path')

function loadEnv () {
  try {
    const envPath = path.join(__dirname, '..', '..', '..', '.env.local')
    if (fs.existsSync(envPath)) {
      for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const m = line.replace(/^export\s+/, '').trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
      }
    }
  } catch {}
}
loadEnv()

const { createClient } = require('@supabase/supabase-js')

class RawWriter {
  /**
   * @param {Object} opts
   * @param {string} opts.source       — required, e.g. 'syarah'
   * @param {string} [opts.runId]      — UUID for the scrape run (groups rows)
   * @param {number} [opts.flushEvery] — default 50
   */
  constructor (opts = {}) {
    if (!opts.source) throw new Error('RawWriter: source required')
    const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('RawWriter: missing Supabase env')
    this.sb       = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    this.source   = opts.source
    this.runId    = opts.runId ?? generateUuid()
    this.flushEvery = opts.flushEvery ?? 50
    this.buffer = []
    this.totals = { queued: 0, written: 0, conflicts: 0, errors: 0, skipped_no_source_id: 0 }
  }

  /**
   * @param {Object} row
   * @param {string} row.source_id        — required, unique within source
   * @param {string} [row.source_url]
   * @param {string|null} [row.raw_html_or_json]
   * @param {Object} row.structured_data  — required, the parsed listing fields
   * @param {string|null} [row.external_price_label]
   * @param {Object|null} [row.platform_metadata]
   * @param {string} [row.scraped_at]     — ISO; defaults to NOW()
   */
  async add (row) {
    if (!row.source_id) { this.totals.skipped_no_source_id++; return }
    const now = row.scraped_at ?? new Date().toISOString()
    // NB: first_seen_at intentionally omitted. On insert, the DEFAULT fires.
    //     On upsert/conflict, the existing first_seen_at is preserved.
    this.buffer.push({
      source:               this.source,
      source_url:           row.source_url ?? null,
      source_id:            String(row.source_id),
      raw_html_or_json:     row.raw_html_or_json ?? null,
      structured_data:      row.structured_data ?? null,
      external_price_label: row.external_price_label ?? null,
      platform_metadata:    row.platform_metadata ?? null,
      scraped_at:           now,
      last_seen_at:         now,
      scrape_run_id:        this.runId,
    })
    this.totals.queued++
    if (this.buffer.length >= this.flushEvery) await this.flush()
  }

  async flush () {
    if (this.buffer.length === 0) return
    const batch = this.buffer.splice(0)
    const { error, count } = await this.sb
      .from('raw_listings')
      .upsert(batch, { onConflict: 'source,source_id', count: 'exact' })
    if (error) {
      this.totals.errors += batch.length
      process.stderr.write(`[raw-writer] upsert failed (${batch.length} rows): ${error.message}\n`)
    } else {
      this.totals.written += batch.length
    }
  }

  async close () {
    await this.flush()
    return this.totals
  }
}

function generateUuid () {
  // RFC4122 v4
  const r = crypto => {
    if (crypto && crypto.randomUUID) return crypto.randomUUID()
    return require('crypto').randomUUID()
  }
  return r(globalThis.crypto)
}

module.exports = { RawWriter }
