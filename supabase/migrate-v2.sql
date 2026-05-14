-- migrate-v2.sql
-- Run this in the Supabase SQL editor BEFORE running scripts/load-real-data.js
-- It drops the mock-data table and replaces it with the real-data schema.

DROP TABLE IF EXISTS listings;

CREATE TABLE listings (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source              TEXT NOT NULL,
  source_url          TEXT,
  source_id           TEXT,
  -- make
  make_slug           TEXT,
  make_en             TEXT,
  make_ar             TEXT,
  -- model
  model_slug          TEXT,
  model_en            TEXT,
  model_ar            TEXT,
  -- core
  year                INTEGER,
  price_sar           INTEGER,
  mileage_km          INTEGER,
  -- city
  city_slug           TEXT,
  city_en             TEXT,
  city_ar             TEXT,
  -- taxonomy
  color_slug          TEXT,
  color_en            TEXT,
  color_ar            TEXT,
  fuel_type_slug      TEXT,
  transmission_slug   TEXT,
  body_type_slug      TEXT,
  condition           TEXT DEFAULT 'used',
  trim                TEXT,
  -- deal scoring
  deal_score          NUMERIC(3,1),
  deal_score_label    TEXT,
  low_price_warning   BOOLEAN NOT NULL DEFAULT false,
  -- flags
  contact_for_price   BOOLEAN NOT NULL DEFAULT false,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  seller_type         TEXT DEFAULT 'private',
  -- content
  title               TEXT,
  description_ar      TEXT,
  photo_urls          TEXT[],
  -- timestamps
  scraped_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Index hot filter paths
CREATE INDEX listings_make_model ON listings (make_slug, model_slug);
CREATE INDEX listings_city       ON listings (city_slug);
CREATE INDEX listings_deal_score ON listings (deal_score DESC NULLS LAST);
CREATE INDEX listings_price      ON listings (price_sar);
CREATE INDEX listings_year       ON listings (year);
CREATE INDEX listings_is_active  ON listings (is_active) WHERE is_active = true;

-- Public read access (no auth required)
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON listings FOR SELECT USING (true);
