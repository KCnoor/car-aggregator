-- migrate-v6.sql: scrape lifecycle timestamps on raw_listings
-- Run in the Supabase SQL editor after migrate-v5.sql.

ALTER TABLE raw_listings
  ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS raw_listings_last_seen_at ON raw_listings (last_seen_at DESC);

-- Pattern: scrapers omit first_seen_at from the upsert payload, letting the
-- DEFAULT fire for new rows and preserving the existing value on conflict.
-- last_seen_at is set on every upsert.

-- Reverse with:
--   ALTER TABLE raw_listings DROP COLUMN last_seen_at, DROP COLUMN first_seen_at;
