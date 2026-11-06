-- path: db/migrations/095_create_merchant_branding.sql

-- Table for sub-merchant invoice branding and custom logo settings
CREATE TABLE IF NOT EXISTS public.merchant_branding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE UNIQUE,
  logo_file_id UUID REFERENCES public.files(id) ON DELETE SET NULL,
  logo_url VARCHAR(512),
  primary_color VARCHAR(16) NOT NULL DEFAULT '#0284c7',
  accent_color VARCHAR(16) NOT NULL DEFAULT '#0369a1',
  footer_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_branding_tenant ON public.merchant_branding (tenant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_branding_company ON public.merchant_branding (company_id);

ALTER TABLE public.merchant_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_branding FORCE ROW LEVEL SECURITY;

CREATE POLICY merchant_branding_tenant_isolation ON public.merchant_branding
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
