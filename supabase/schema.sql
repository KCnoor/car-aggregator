-- Run this first in the Supabase SQL editor

CREATE TABLE listings (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source        TEXT NOT NULL,
  source_url    TEXT,
  make          TEXT NOT NULL,
  model         TEXT NOT NULL,
  year          INTEGER NOT NULL,
  mileage       INTEGER,
  price         INTEGER NOT NULL,
  city          TEXT NOT NULL,
  condition     TEXT DEFAULT 'used',
  color         TEXT,
  transmission  TEXT DEFAULT 'automatic',
  fuel_type     TEXT DEFAULT 'petrol',
  body_type     TEXT,
  engine_size   TEXT,
  seller_type   TEXT DEFAULT 'private',
  description   TEXT,
  deal_score    NUMERIC(3,1),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Allow anyone to read listings (no login required)
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public can read listings" ON listings FOR SELECT USING (true);
