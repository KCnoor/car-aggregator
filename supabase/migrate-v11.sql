-- migrate-v11.sql: Mode switcher v0 — waitlist + match feedback capture.
-- Run in the Supabase SQL editor after migrate-v10b.sql. Additive, reversible.

-- Email/phone capture from the Analyzer / Pulse teaser pages.
-- mode_interested: 'analyzer' | 'pulse' (free-form TEXT for future modes).
CREATE TABLE IF NOT EXISTS waitlist (
  id               BIGSERIAL PRIMARY KEY,
  email            TEXT,
  phone            TEXT,
  mode_interested  TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent       TEXT,
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS waitlist_mode_created
  ON waitlist (mode_interested, created_at DESC);

-- "This isn't quite me" — free-text capture from /match.
-- Eventually feeds the AI version of الخطّابة. For v0 it's just an
-- append-only signal log.
CREATE TABLE IF NOT EXISTS match_feedback (
  id                  BIGSERIAL PRIMARY KEY,
  persona_selected    TEXT,
  what_they_wanted    TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent          TEXT
);

CREATE INDEX IF NOT EXISTS match_feedback_created ON match_feedback (created_at DESC);

-- RLS: both tables receive PII via the anon key (form submissions), so we
-- need a permissive INSERT policy for anon but no SELECT (read happens
-- server-side via service role).
ALTER TABLE waitlist       ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY waitlist_anon_insert       ON waitlist       FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY match_feedback_anon_insert ON match_feedback FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Reverse with:
--   DROP TABLE match_feedback;
--   DROP TABLE waitlist;
