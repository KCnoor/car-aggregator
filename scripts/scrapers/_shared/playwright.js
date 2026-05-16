'use strict'
// Lazy-loaded Playwright browser helper for scrapers that need a real DOM.
// Loaded on demand so non-Playwright scrapers (REST APIs) don't import the
// dep. CarSwitch and Dubizzle in Phase B require stealth; legacy scrapers
// (Syarah, Saudisale) used vanilla Playwright.
//
// stealthLaunch() uses playwright-extra + puppeteer-extra-plugin-stealth if
// installed; otherwise falls back to vanilla playwright with reasonable
// anti-fingerprint defaults.

let _chromium // resolved lazily
let _stealth  // resolved lazily

function load () {
  if (_chromium) return
  try {
    const { chromium } = require('playwright-extra')
    const stealth = require('puppeteer-extra-plugin-stealth')()
    chromium.use(stealth)
    _chromium = chromium
    _stealth = true
  } catch {
    _chromium = require('playwright').chromium
    _stealth = false
  }
}

async function launchBrowser (opts = {}) {
  load()
  const browser = await _chromium.launch({
    headless: opts.headless ?? true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      ...(opts.extraArgs ?? []),
    ],
  })
  const context = await browser.newContext({
    userAgent: opts.userAgent ?? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport:  opts.viewport  ?? { width: 1366, height: 900 },
    locale:    opts.locale    ?? 'en-US',
    timezoneId: opts.timezoneId ?? 'Asia/Riyadh',
    ...(opts.contextOpts ?? {}),
  })
  return { browser, context, hasStealth: _stealth }
}

module.exports = { launchBrowser }
