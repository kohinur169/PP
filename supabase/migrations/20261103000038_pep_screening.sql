-- path: supabase/migrations/20261103000038_pep_screening.sql

CREATE TABLE IF NOT EXISTS public.pep_screening_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  individual_name TEXT NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'ubo',
  pep_tier INTEGER CHECK (pep_tier IS NULL OR pep_tier IN (1, 2, 3)),
  pep_position TEXT,
  adverse_media_flag BOOLEAN NOT NULL DEFAULT false,
  adverse_media_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'pending_edd'
    CHECK (status IN ('pending_edd', 'compliance_recommended', 'ceo_approved', 'rejected')),
  source_of_wealth TEXT,
  source_of_funds TEXT,
  compliance_rationale TEXT,
  compliance_officer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  compliance_recommended_at TIMESTAMPTZ,
  ceo_approver_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ceo_approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pep_cases_tenant ON public.pep_screening_cases (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pep_cases_company ON public.pep_screening_cases (company_id);
CREATE INDEX IF NOT EXISTS idx_pep_cases_status ON public.pep_screening_cases (status);

ALTER TABLE public.pep_screening_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pep_screening_cases FORCE ROW LEVEL SECURITY;

CREATE POLICY pep_screening_cases_tenant_isolation ON public.pep_screening_cases
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
