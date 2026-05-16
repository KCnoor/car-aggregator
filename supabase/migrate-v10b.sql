-- migrate-v10b.sql: Public read access on canonical_makes / canonical_models.
--
-- migrate-v10.sql created the tables but didn't add RLS policies. The page
-- uses the anon Supabase key (NEXT_PUBLIC_SUPABASE_ANON_KEY), so when
-- Supabase's project default has RLS-on-new-tables enabled, the canonical
-- fetch silently returns zero rows and the filter dropdown falls back to
-- DISTINCT make_en from listings — which re-introduces 'Mercedes' / 'Mercedes
-- Benz' / 'Mercedes-Benz' triplicates.
--
-- The canonical tables hold no PII, just a public car-make catalogue, so a
-- blanket SELECT policy for anon + authenticated is correct.

ALTER TABLE canonical_makes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY canonical_makes_anon_read
  ON canonical_makes  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY canonical_models_anon_read
  ON canonical_models FOR SELECT TO anon, authenticated USING (true);

-- Reverse with:
--   DROP POLICY canonical_makes_anon_read  ON canonical_makes;
--   DROP POLICY canonical_models_anon_read ON canonical_models;
