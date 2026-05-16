-- migrate-v7.sql: Enrichment columns for dealer / consensus / cross-source signals.
-- Run in the Supabase SQL editor after migrate-v6.sql. Strictly additive.

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS dealer_signature           TEXT,
  ADD COLUMN IF NOT EXISTS is_dealer_multi_upload     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS market_consensus_score     SMALLINT,
  ADD COLUMN IF NOT EXISTS mileage_per_year           NUMERIC,
  ADD COLUMN IF NOT EXISTS cross_source_listing_group UUID;

CREATE INDEX IF NOT EXISTS listings_dealer_signature       ON listings (dealer_signature) WHERE dealer_signature IS NOT NULL;
CREATE INDEX IF NOT EXISTS listings_multi_upload           ON listings (is_dealer_multi_upload) WHERE is_dealer_multi_upload = TRUE;
CREATE INDEX IF NOT EXISTS listings_consensus              ON listings (market_consensus_score) WHERE market_consensus_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS listings_cross_source_group     ON listings (cross_source_listing_group) WHERE cross_source_listing_group IS NOT NULL;
CREATE INDEX IF NOT EXISTS listings_mileage_per_year       ON listings (mileage_per_year) WHERE mileage_per_year IS NOT NULL;

-- Reverse with:
--   ALTER TABLE listings
--     DROP COLUMN cross_source_listing_group,
--     DROP COLUMN mileage_per_year,
--     DROP COLUMN market_consensus_score,
--     DROP COLUMN is_dealer_multi_upload,
--     DROP COLUMN dealer_signature;
