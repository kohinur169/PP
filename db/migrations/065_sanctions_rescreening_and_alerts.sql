-- path: db/migrations/065_sanctions_rescreening_and_alerts.sql

-- 1. Table for tracking daily sanctions / PEP rescreening runs and stale feed detection
CREATE TABLE IF NOT EXISTS public.sanctions_rescreening_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_date DATE NOT NULL,
  total_entities_screened INT NOT NULL DEFAULT 0,
  matches_detected INT NOT NULL DEFAULT 0,
  payouts_frozen_count INT NOT NULL DEFAULT 0,
  is_feed_stale BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rescreening_tenant ON public.sanctions_rescreening_runs (tenant_id);

ALTER TABLE public.sanctions_rescreening_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanctions_rescreening_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY sanctions_rescreening_runs_tenant_isolation ON public.sanctions_rescreening_runs
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 2. Table for compliance office alerts (sanctions matches, stale feeds, volume spikes)
CREATE TABLE IF NOT EXISTS public.compliance_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  alert_type VARCHAR(64) NOT NULL,
  severity VARCHAR(32) NOT NULL DEFAULT 'high'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title VARCHAR(255) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(32) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'resolved', 'dismissed')),
  resolved_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_alerts_tenant ON public.compliance_alerts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_compliance_alerts_status ON public.compliance_alerts (status);

ALTER TABLE public.compliance_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_alerts FORCE ROW LEVEL SECURITY;

CREATE POLICY compliance_alerts_tenant_isolation ON public.compliance_alerts
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
