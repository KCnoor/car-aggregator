'use strict'
// Shared constants used by scoring + baselines.
//
// COUNTRY_SCOPE_SENTINEL: stored in price_baselines.city_slug for
// country-level rows. Postgres PKs cannot include NULL, so we use a
// sentinel string that no real city_slug will ever collide with.
// Always reference this constant — never the literal string.

const COUNTRY_SCOPE_SENTINEL = '__country__'

const SCOPE_CITY    = 'city'
const SCOPE_COUNTRY = 'country'

module.exports = {
  COUNTRY_SCOPE_SENTINEL,
  SCOPE_CITY,
  SCOPE_COUNTRY,
}
