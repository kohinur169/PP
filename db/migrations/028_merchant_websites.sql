-- path: db/migrations/028_merchant_websites.sql

CREATE TABLE IF NOT EXISTS public.merchant_websites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  crawl_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  http_status_code INT,
  ssl_valid BOOLEAN NOT NULL DEFAULT false,
  terms_found BOOLEAN NOT NULL DEFAULT false,
  terms_url TEXT,
  refund_policy_found BOOLEAN NOT NULL DEFAULT false,
  refund_policy_url TEXT,
  contact_info_found BOOLEAN NOT NULL DEFAULT false,
  pricing_usd_found BOOLEAN NOT NULL DEFAULT false,
  verification_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_websites_company ON public.merchant_websites (company_id);
CREATE INDEX IF NOT EXISTS idx_merchant_websites_tenant ON public.merchant_websites (tenant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_websites_status ON public.merchant_websites (verification_status);

ALTER TABLE public.merchant_websites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_websites FORCE ROW LEVEL SECURITY;

CREATE POLICY merchant_websites_tenant_isolation ON public.merchant_websites
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
