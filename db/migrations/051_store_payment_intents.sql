-- path: db/migrations/051_store_payment_intents.sql

CREATE TABLE IF NOT EXISTS public.store_payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  api_key_id UUID NOT NULL REFERENCES public.merchant_api_keys(id) ON DELETE CASCADE,
  client_secret VARCHAR(128) NOT NULL UNIQUE,
  order_id VARCHAR(128) NOT NULL,
  amount NUMERIC(18,4) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  status VARCHAR(32) NOT NULL DEFAULT 'requires_payment_method'
    CHECK (status IN ('requires_payment_method', 'requires_confirmation', 'requires_action', 'processing', 'succeeded', 'canceled')),
  customer_email VARCHAR(255),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_payment_intents_tenant ON public.store_payment_intents (tenant_id);
CREATE INDEX IF NOT EXISTS idx_store_payment_intents_company ON public.store_payment_intents (company_id);
CREATE INDEX IF NOT EXISTS idx_store_payment_intents_order ON public.store_payment_intents (order_id);
CREATE INDEX IF NOT EXISTS idx_store_payment_intents_secret ON public.store_payment_intents (client_secret);
CREATE INDEX IF NOT EXISTS idx_store_payment_intents_status ON public.store_payment_intents (status);

ALTER TABLE public.store_payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_payment_intents FORCE ROW LEVEL SECURITY;

CREATE POLICY store_payment_intents_tenant_isolation ON public.store_payment_intents
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
