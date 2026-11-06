-- path: db/migrations/094_create_payment_links.sql

-- Table for general reusable payment links and hosted checkout slugs
CREATE TABLE IF NOT EXISTS public.payment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  slug VARCHAR(128) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  amount NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
  is_fixed_amount BOOLEAN NOT NULL DEFAULT true,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  is_active BOOLEAN NOT NULL DEFAULT true,
  redirect_url VARCHAR(512),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_links_tenant ON public.payment_links (tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_company ON public.payment_links (company_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_slug ON public.payment_links (slug);
CREATE INDEX IF NOT EXISTS idx_payment_links_status ON public.payment_links (is_active);

ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_links FORCE ROW LEVEL SECURITY;

CREATE POLICY payment_links_tenant_isolation ON public.payment_links
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
