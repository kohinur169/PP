-- path: db/migrations/038_gateway_credentials.sql

CREATE TABLE IF NOT EXISTS public.gateway_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_slug VARCHAR(32) NOT NULL
    CHECK (provider_slug IN ('nmi', 'stripe_connect', 'rainforest', 'airwallex', 'payoneer')),
  credential_type VARCHAR(64) NOT NULL,
  encrypted_payload TEXT NOT NULL,
  last4 VARCHAR(8) NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  environment VARCHAR(16) NOT NULL DEFAULT 'sandbox'
    CHECK (environment IN ('sandbox', 'production')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unq_tenant_provider_cred UNIQUE (tenant_id, provider_slug, credential_type, environment)
);

CREATE INDEX IF NOT EXISTS idx_gateway_credentials_tenant ON public.gateway_credentials (tenant_id);
CREATE INDEX IF NOT EXISTS idx_gateway_credentials_provider ON public.gateway_credentials (provider_slug);
CREATE INDEX IF NOT EXISTS idx_gateway_credentials_active ON public.gateway_credentials (is_active);

ALTER TABLE public.gateway_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gateway_credentials FORCE ROW LEVEL SECURITY;

CREATE POLICY gateway_credentials_tenant_isolation ON public.gateway_credentials
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
