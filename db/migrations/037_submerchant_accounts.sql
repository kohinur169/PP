-- path: db/migrations/037_submerchant_accounts.sql

CREATE TABLE IF NOT EXISTS public.submerchant_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider_name VARCHAR(32) NOT NULL
    CHECK (provider_name IN ('nmi', 'stripe_connect', 'rainforest', 'airwallex', 'payoneer')),
  provider_submerchant_id VARCHAR(128),
  status VARCHAR(32) NOT NULL DEFAULT 'provisioning'
    CHECK (status IN ('provisioning', 'active', 'restricted', 'suspended', 'pending_master_gateway')),
  capabilities JSONB NOT NULL DEFAULT '{"card_payments": false, "transfers": false, "payouts": false}'::jsonb,
  webhook_endpoint_id VARCHAR(128),
  last_synced_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unq_company_provider UNIQUE (company_id, provider_name)
);

CREATE INDEX IF NOT EXISTS idx_submerchants_tenant ON public.submerchant_accounts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_submerchants_company ON public.submerchant_accounts (company_id);
CREATE INDEX IF NOT EXISTS idx_submerchants_provider ON public.submerchant_accounts (provider_name);
CREATE INDEX IF NOT EXISTS idx_submerchants_status ON public.submerchant_accounts (status);

ALTER TABLE public.submerchant_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submerchant_accounts FORCE ROW LEVEL SECURITY;

CREATE POLICY submerchant_accounts_tenant_isolation ON public.submerchant_accounts
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
