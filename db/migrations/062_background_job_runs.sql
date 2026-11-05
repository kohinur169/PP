-- path: db/migrations/062_background_job_runs.sql

-- Table for tracking background job runs, execution locks and idempotency
CREATE TABLE IF NOT EXISTS public.background_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_name VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'locked')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  items_processed INT NOT NULL DEFAULT 0,
  items_failed INT NOT NULL DEFAULT 0,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_runs_tenant ON public.background_job_runs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_runs_name_status ON public.background_job_runs (job_name, status);

ALTER TABLE public.background_job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.background_job_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY background_job_runs_tenant_isolation ON public.background_job_runs
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
