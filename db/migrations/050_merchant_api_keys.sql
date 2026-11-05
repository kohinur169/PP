-- path: db/migrations/050_merchant_api_keys.sql

CREATE TABLE IF NOT EXISTS public.merchant_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL DEFAULT 'Online Store Key',
  publishable_key VARCHAR(128) NOT NULL UNIQUE,
  key_hash VARCHAR(128) NOT NULL UNIQUE,
  masked_secret_key VARCHAR(128) NOT NULL,
  environment VARCHAR(16) NOT NULL DEFAULT 'live'
    CHECK (environment IN ('live', 'test')),
  status VARCHAR(32) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked', 'expired')),
  created_by UUID NOT NULL REFERENCES public.users(id),
  revoked_by UUID REFERENCES public.users(id),
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_api_keys_tenant ON public.merchant_api_keys (tenant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_api_keys_company ON public.merchant_api_keys (company_id);
CREATE INDEX IF NOT EXISTS idx_merchant_api_keys_hash ON public.merchant_api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_merchant_api_keys_pub ON public.merchant_api_keys (publishable_key);
CREATE INDEX IF NOT EXISTS idx_merchant_api_keys_status ON public.merchant_api_keys (status);

ALTER TABLE public.merchant_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_api_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY merchant_api_keys_tenant_isolation ON public.merchant_api_keys
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
