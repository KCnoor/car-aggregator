-- migrate-v9.sql: Pipeline audit trail. Run in the Supabase SQL editor
-- after migrate-v8.sql. Strictly additive.

-- One row per stage execution of `npm run pipeline:refresh`. Multiple rows
-- share a run_id (UUID) so `pipeline_status` can group them under one run.
-- status values: 'running' (in-flight), 'success', 'failed', 'gate_failed'.
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id            BIGSERIAL PRIMARY KEY,
  run_id        UUID        NOT NULL,
  stage         TEXT        NOT NULL,
  source        TEXT,
  status        TEXT        NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  metrics       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  notes         TEXT
);

-- Recency queries (pipeline_status latest 10 etc.).
CREATE INDEX IF NOT EXISTS pipeline_runs_started_at ON pipeline_runs (started_at DESC);

-- Drift detection: latest successful scrape per source.
CREATE INDEX IF NOT EXISTS pipeline_runs_stage_source_completed
  ON pipeline_runs (stage, source, completed_at DESC)
  WHERE status = 'success';

-- Group by pipeline invocation.
CREATE INDEX IF NOT EXISTS pipeline_runs_run_id ON pipeline_runs (run_id);

-- Reverse with:
--   DROP TABLE pipeline_runs;
