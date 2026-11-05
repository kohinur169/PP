-- path: db/migrations/068_merchant_outbound_webhooks.sql

-- 1. Table for merchant outbound webhook endpoints
CREATE TABLE IF NOT EXISTS public.merchant_webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  url VARCHAR(2048) NOT NULL,
  subscribed_events TEXT[] NOT NULL DEFAULT '{}',
  encrypted_secret TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant ON public.merchant_webhook_endpoints (tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_company ON public.merchant_webhook_endpoints (company_id);

ALTER TABLE public.merchant_webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_webhook_endpoints FORCE ROW LEVEL SECURITY;

CREATE POLICY merchant_webhook_endpoints_tenant_isolation ON public.merchant_webhook_endpoints
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 2. Table for outbound webhook deliveries with 10-attempt retry lifecycle
CREATE TABLE IF NOT EXISTS public.merchant_webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  endpoint_id UUID NOT NULL REFERENCES public.merchant_webhook_endpoints(id) ON DELETE CASCADE,
  event_type VARCHAR(128) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivered', 'retrying', 'failed_exhausted')),
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 10,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_status_code INT,
  last_latency_ms INT,
  last_response_snippet TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_tenant ON public.merchant_webhook_deliveries (tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint ON public.merchant_webhook_deliveries (endpoint_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON public.merchant_webhook_deliveries (status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_next_attempt ON public.merchant_webhook_deliveries (next_attempt_at);

ALTER TABLE public.merchant_webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_webhook_deliveries FORCE ROW LEVEL SECURITY;

CREATE POLICY merchant_webhook_deliveries_tenant_isolation ON public.merchant_webhook_deliveries
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
