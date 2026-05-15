-- migrate-v5.sql: dual-scope baselines + baseline_scope on listings
-- Run in the Supabase SQL editor after migrate-v4.sql.
-- Strictly additive (no data loss). Safe to re-run.

-- ── 1. price_baselines: add scope column, recreate PK ─────────────────────
-- Existing rows are city-scope by definition; new column defaults to 'city'.
ALTER TABLE price_baselines
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'city'
    CHECK (scope IN ('city','country'));

-- Drop & re-create PK to include scope. Country rows store
-- city_slug = '__country__' (sentinel; defined in lib/scoring/constants.js).
ALTER TABLE price_baselines DROP CONSTRAINT IF EXISTS price_baselines_pkey;
ALTER TABLE price_baselines
  ADD CONSTRAINT price_baselines_pkey
  PRIMARY KEY (make_slug, model_slug, year, city_slug, scope);

-- ── 2. listings.baseline_scope (forensic visibility) ──────────────────────
-- NULL for AI-valuation rows; 'city' or 'country' for baseline rows.
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS baseline_scope TEXT
    CHECK (baseline_scope IN ('city','country') OR baseline_scope IS NULL);

CREATE INDEX IF NOT EXISTS listings_baseline_scope
  ON listings (baseline_scope) WHERE baseline_scope IS NOT NULL;

-- Reverse with:
--   ALTER TABLE listings DROP COLUMN baseline_scope;
--   ALTER TABLE price_baselines DROP CONSTRAINT price_baselines_pkey;
--   ALTER TABLE price_baselines ADD CONSTRAINT price_baselines_pkey PRIMARY KEY (make_slug, model_slug, year, city_slug);
--   ALTER TABLE price_baselines DROP COLUMN scope;
