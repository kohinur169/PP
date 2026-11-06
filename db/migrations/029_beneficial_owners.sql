-- path: db/migrations/029_beneficial_owners.sql

CREATE TABLE IF NOT EXISTS public.company_beneficial_owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  date_of_birth DATE NOT NULL,
  nationality VARCHAR(2) NOT NULL,
  equity_percentage NUMERIC(5, 2) NOT NULL CHECK (equity_percentage >= 0 AND equity_percentage <= 100),
  is_director BOOLEAN NOT NULL DEFAULT false,
  is_primary_signatory BOOLEAN NOT NULL DEFAULT false,
  residential_address JSONB NOT NULL DEFAULT '{}'::jsonb,
  id_doc_id UUID REFERENCES public.files(id) ON DELETE SET NULL,
  proof_of_address_doc_id UUID REFERENCES public.files(id) ON DELETE SET NULL,
  liveness_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  verification_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  rejection_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ubo_company ON public.company_beneficial_owners (company_id);
CREATE INDEX IF NOT EXISTS idx_ubo_tenant ON public.company_beneficial_owners (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ubo_status ON public.company_beneficial_owners (verification_status);

ALTER TABLE public.company_beneficial_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_beneficial_owners FORCE ROW LEVEL SECURITY;

CREATE POLICY ubo_tenant_isolation ON public.company_beneficial_owners
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
