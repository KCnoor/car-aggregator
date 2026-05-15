-- migrate-v4.sql: Pipeline v2 refactor (raw layer + baselines + v2 scoring columns)
-- Run in the Supabase SQL editor BEFORE running scripts/normalize.js, baselines, or score.
-- Strictly additive: no DROP, no DELETE, no TRUNCATE on existing tables.
-- Safely re-runnable thanks to IF NOT EXISTS guards.

-- ---------------------------------------------------------------------------
-- 1. raw_listings: Layer 1 (scrape) destination. One row per scraped listing.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw_listings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source               TEXT NOT NULL,
  source_url           TEXT,
  source_id            TEXT,
  raw_html_or_json     TEXT,
  structured_data      JSONB,
  external_price_label TEXT,
  platform_metadata    JSONB,
  scraped_at           TIMESTAMPTZ DEFAULT NOW(),
  scrape_run_id        UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS raw_listings_source_id   ON raw_listings (source, source_id);
CREATE INDEX        IF NOT EXISTS raw_listings_scraped_at  ON raw_listings (scraped_at DESC);

ALTER TABLE raw_listings ENABLE ROW LEVEL SECURITY;
-- No policy = anon role cannot read. Scripts use service-role key.

-- ---------------------------------------------------------------------------
-- 2. price_baselines: Layer 3 output. (make, model, year, city) statistics.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS price_baselines (
  make_slug             TEXT NOT NULL,
  model_slug            TEXT NOT NULL,
  year                  INTEGER NOT NULL,
  city_slug             TEXT NOT NULL,
  sample_size           INTEGER NOT NULL,
  median_price          NUMERIC,
  weighted_median_price NUMERIC,
  p25                   NUMERIC,
  p75                   NUMERIC,
  std_dev               NUMERIC,
  last_computed         TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (make_slug, model_slug, year, city_slug)
);

ALTER TABLE price_baselines ENABLE ROW LEVEL SECURITY;
-- Same: service-role only.

-- ---------------------------------------------------------------------------
-- 3. listings: additive columns for the v2 scoring engine + tier system.
-- ---------------------------------------------------------------------------
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS source_quality_tier   SMALLINT,
  ADD COLUMN IF NOT EXISTS external_price_label  TEXT,
  ADD COLUMN IF NOT EXISTS platform_metadata     JSONB,
  ADD COLUMN IF NOT EXISTS low_source_confidence BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deal_score_v2         NUMERIC(3,1),
  ADD COLUMN IF NOT EXISTS score_source_v2       TEXT,
  ADD COLUMN IF NOT EXISTS score_tier_v2         TEXT,
  ADD COLUMN IF NOT EXISTS red_flags             TEXT[],
  ADD COLUMN IF NOT EXISTS red_flag_penalty      NUMERIC(3,1);

-- Backfill source_quality_tier from current source. Only fires once per row.
UPDATE listings
SET source_quality_tier = CASE
  WHEN source IN ('syarah','soum','carswitch','digitalcar')   THEN 1
  WHEN source IN ('motory','yallamotor','gogomotor')          THEN 2
  ELSE 3
END
WHERE source_quality_tier IS NULL;

CREATE INDEX IF NOT EXISTS listings_source_quality_tier ON listings (source_quality_tier);
CREATE INDEX IF NOT EXISTS listings_deal_score_v2       ON listings (deal_score_v2 DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS listings_red_flags_gin       ON listings USING GIN (red_flags);

-- Done. Reverse with:
--   ALTER TABLE listings DROP COLUMN red_flag_penalty, DROP COLUMN red_flags,
--     DROP COLUMN score_tier_v2, DROP COLUMN score_source_v2, DROP COLUMN deal_score_v2,
--     DROP COLUMN low_source_confidence, DROP COLUMN platform_metadata,
--     DROP COLUMN external_price_label, DROP COLUMN source_quality_tier;
--   DROP TABLE price_baselines;
--   DROP TABLE raw_listings;
