-- path: db/migrations/035_sar_cases.sql

CREATE TABLE IF NOT EXISTS public.sar_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  case_number VARCHAR(32) NOT NULL UNIQUE,
  fincen_bsa_identifier VARCHAR(64),
  status VARCHAR(16) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'filed', 'closed')),
  suspect_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  suspicious_activity_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  narrative TEXT NOT NULL,
  evidence_pack JSONB NOT NULL DEFAULT '{}'::jsonb,
  fictitious_transaction_count INTEGER NOT NULL DEFAULT 0,
  total_suspicious_amount_usd NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  filed_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  filed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sar_cases_tenant ON public.sar_cases (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sar_cases_company ON public.sar_cases (company_id);
CREATE INDEX IF NOT EXISTS idx_sar_cases_status ON public.sar_cases (status);

ALTER TABLE public.sar_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sar_cases FORCE ROW LEVEL SECURITY;

CREATE POLICY sar_cases_tenant_isolation ON public.sar_cases
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
