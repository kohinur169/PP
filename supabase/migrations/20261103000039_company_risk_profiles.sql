-- path: supabase/migrations/20261103000039_company_risk_profiles.sql

CREATE TABLE IF NOT EXISTS public.company_risk_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  risk_tier INTEGER NOT NULL DEFAULT 1 CHECK (risk_tier IN (1, 2, 3)),
  single_transaction_cap_usd NUMERIC(18, 4) NOT NULL DEFAULT 500.0000,
  monthly_volume_cap_usd NUMERIC(18, 4) NOT NULL DEFAULT 2500.0000,
  rolling_reserve_percent NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
  rolling_reserve_days INTEGER NOT NULL DEFAULT 90,
  mcc_code VARCHAR(4) NOT NULL,
  mcc_category VARCHAR(64) NOT NULL,
  risk_score INTEGER NOT NULL DEFAULT 25 CHECK (risk_score BETWEEN 0 AND 100),
  version INTEGER NOT NULL DEFAULT 1,
  reviewer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_profiles_tenant ON public.company_risk_profiles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_risk_profiles_company ON public.company_risk_profiles (company_id);
CREATE INDEX IF NOT EXISTS idx_risk_profiles_tier ON public.company_risk_profiles (risk_tier);

ALTER TABLE public.company_risk_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_risk_profiles FORCE ROW LEVEL SECURITY;

CREATE POLICY company_risk_profiles_tenant_isolation ON public.company_risk_profiles
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
