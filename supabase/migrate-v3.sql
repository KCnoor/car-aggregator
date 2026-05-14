-- migrate-v3.sql: Add AI pricing engine columns
-- Run in Supabase SQL editor BEFORE running scripts/ai-valuation.js

ALTER TABLE listings ADD COLUMN IF NOT EXISTS score_source       TEXT;     -- 'db_median' | 'ai_valuation'
ALTER TABLE listings ADD COLUMN IF NOT EXISTS score_comparables  INTEGER;  -- group size used by db_median engine

-- Tag existing DB-median scored rows (they have a score but no source label yet)
UPDATE listings
SET score_source = 'db_median'
WHERE deal_score IS NOT NULL
  AND contact_for_price = false;

CREATE INDEX IF NOT EXISTS listings_score_source ON listings (score_source);
