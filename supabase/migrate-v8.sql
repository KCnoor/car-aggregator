-- migrate-v8.sql: Freshness monitoring.
-- Run in the Supabase SQL editor after migrate-v7.sql. Strictly additive.

-- freshness_state is a free-form TEXT for now (not a Postgres ENUM) so we can
-- add states later (e.g. 'redirect_to_search') without an ALTER TYPE migration.
-- Allowed values today: 'unverified' (default), 'verified_active', 'stale', 'dead'.
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS freshness_state   TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS last_verified_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_checked_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_http_status  SMALLINT,
  ADD COLUMN IF NOT EXISTS dead_reason       TEXT;

-- Partial indexes so the daily sweep query stays cheap.
CREATE INDEX IF NOT EXISTS listings_freshness_state  ON listings (freshness_state);
CREATE INDEX IF NOT EXISTS listings_last_checked_at  ON listings (last_checked_at NULLS FIRST)
  WHERE is_active = TRUE;

-- Coverage snapshots: one row per (source, make, model) per day. Powers the
-- weekly coverage audit (scripts/coverage-audit.js) which flags scraper
-- degradation by comparing today's active counts against prior snapshots.
CREATE TABLE IF NOT EXISTS coverage_snapshots (
  snapshot_date  DATE NOT NULL,
  source         TEXT NOT NULL,
  make_slug      TEXT NOT NULL,
  model_slug     TEXT NOT NULL,
  active_count   INTEGER NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (snapshot_date, source, make_slug, model_slug)
);

CREATE INDEX IF NOT EXISTS coverage_snapshots_date ON coverage_snapshots (snapshot_date DESC);

-- Reverse with:
--   DROP TABLE coverage_snapshots;
--   ALTER TABLE listings
--     DROP COLUMN dead_reason,
--     DROP COLUMN last_http_status,
--     DROP COLUMN last_checked_at,
--     DROP COLUMN last_verified_at,
--     DROP COLUMN freshness_state;
