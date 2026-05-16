'use strict'
// Shared HTTP helper for scrapers.
//
// - Retries with exponential backoff on transient errors (network errors,
//   5xx, 429).
// - UA rotation through a curated browser pool. Override per-call if a
//   site requires something specific.
// - Default 30s timeout per request.
// - Returns { status, headers, body } where body is the raw string;
//   helpers below for JSON/text/buffer.

const https = require('https')
const http  = require('http')
const { URL } = require('url')

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
]

function pickUA () { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] }
function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

async function fetchOnce (url, opts = {}) {
  const u = new URL(url)
  const isHttps = u.protocol === 'https:'
  const lib = isHttps ? https : http
  const method = (opts.method || 'GET').toUpperCase()
  const body = opts.body ?? null
  const headers = {
    'Accept': opts.accept ?? 'text/html,application/xhtml+xml,application/json,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
    'User-Agent': opts.userAgent ?? pickUA(),
    ...(opts.headers ?? {}),
  }
  if (body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  if (body) headers['Content-Length'] = Buffer.byteLength(body)

  return await new Promise((resolve, reject) => {
    const req = lib.request({
      hostname: u.hostname,
      port:     u.port || (isHttps ? 443 : 80),
      path:     u.pathname + u.search,
      method,
      headers,
      timeout:  opts.timeout ?? 30000,
      rejectUnauthorized: opts.rejectUnauthorized ?? false,
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

async function fetchWithRetry (url, opts = {}) {
  const retries = opts.retries ?? 3
  const backoffMs = opts.backoffMs ?? 1500
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchOnce(url, opts)
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        // Retryable HTTP status
        if (attempt < retries) {
          const sleepMs = backoffMs * Math.pow(2, attempt) + Math.random() * 500
          await sleep(sleepMs)
          continue
        }
      }
      return res
    } catch (e) {
      lastErr = e
      if (attempt < retries) {
        const sleepMs = backoffMs * Math.pow(2, attempt) + Math.random() * 500
        await sleep(sleepMs)
      }
    }
  }
  throw lastErr ?? new Error('fetch failed')
}

async function fetchJSON (url, opts = {}) {
  const res = await fetchWithRetry(url, { accept: 'application/json', ...opts })
  if (res.status >= 400) throw new Error(`${res.status} ${url.slice(0, 80)}: ${res.body.slice(0, 200)}`)
  return JSON.parse(res.body)
}

async function fetchText (url, opts = {}) {
  const res = await fetchWithRetry(url, opts)
  if (res.status >= 400) throw new Error(`${res.status} ${url.slice(0, 80)}`)
  return res.body
}

module.exports = { fetchOnce, fetchWithRetry, fetchJSON, fetchText, pickUA, sleep, USER_AGENTS }
