-- migrate-v10.sql: Canonical make/model reference (lite).
-- Run in the Supabase SQL editor after migrate-v9.sql. Strictly additive.

-- One row per canonical make. canonical_make_slug is the PK and the value
-- that listings.make_slug normalizes to.
-- alternate_names_{en,ar} are TEXT[] arrays of all the variants we expect to
-- see in the wild (lowercased; the canonicalizer lowercases inputs too).
CREATE TABLE IF NOT EXISTS canonical_makes (
  canonical_make_slug TEXT PRIMARY KEY,
  canonical_name_en   TEXT NOT NULL,
  canonical_name_ar   TEXT NOT NULL,
  alternate_names_en  TEXT[] NOT NULL DEFAULT '{}',
  alternate_names_ar  TEXT[] NOT NULL DEFAULT '{}',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite (make_slug, model_slug) is the PK. Models live under their make.
CREATE TABLE IF NOT EXISTS canonical_models (
  canonical_make_slug  TEXT NOT NULL REFERENCES canonical_makes(canonical_make_slug) ON DELETE CASCADE,
  canonical_model_slug TEXT NOT NULL,
  canonical_name_en    TEXT NOT NULL,
  canonical_name_ar    TEXT NOT NULL,
  alternate_names_en   TEXT[] NOT NULL DEFAULT '{}',
  alternate_names_ar   TEXT[] NOT NULL DEFAULT '{}',
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (canonical_make_slug, canonical_model_slug)
);

CREATE INDEX IF NOT EXISTS canonical_models_make ON canonical_models (canonical_make_slug);

-- Flag rows whose make_slug or model_slug we couldn't map to the canonical
-- catalogue. Surfaces long-tail / typo / fake-make cases for manual review.
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS needs_make_review BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS listings_needs_make_review ON listings (needs_make_review)
  WHERE needs_make_review = TRUE;

-- Reverse with:
--   ALTER TABLE listings DROP COLUMN needs_make_review;
--   DROP TABLE canonical_models;
--   DROP TABLE canonical_makes;
