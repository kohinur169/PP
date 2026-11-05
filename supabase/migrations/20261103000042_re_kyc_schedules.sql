-- path: supabase/migrations/20261103000042_re_kyc_schedules.sql

CREATE TABLE IF NOT EXISTS public.re_kyc_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  trigger_reason VARCHAR(64) NOT NULL,
  due_date DATE NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'in_progress', 'cleared', 'overdue_restricted')),
  payouts_restricted BOOLEAN NOT NULL DEFAULT false,
  offer_creation_restricted BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_re_kyc_tenant ON public.re_kyc_schedules (tenant_id);
CREATE INDEX IF NOT EXISTS idx_re_kyc_company ON public.re_kyc_schedules (company_id);
CREATE INDEX IF NOT EXISTS idx_re_kyc_status ON public.re_kyc_schedules (status);
CREATE INDEX IF NOT EXISTS idx_re_kyc_due_date ON public.re_kyc_schedules (due_date);

ALTER TABLE public.re_kyc_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.re_kyc_schedules FORCE ROW LEVEL SECURITY;

CREATE POLICY re_kyc_schedules_tenant_isolation ON public.re_kyc_schedules
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
