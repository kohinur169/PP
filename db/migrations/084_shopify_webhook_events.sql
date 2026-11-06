-- path: db/migrations/084_shopify_webhook_events.sql

-- Table for tracking processed Shopify store webhooks with idempotency and audit logs
CREATE TABLE IF NOT EXISTS public.shopify_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.shopify_store_connections(id) ON DELETE CASCADE,
  webhook_id VARCHAR(64) NOT NULL UNIQUE,
  topic VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(32) NOT NULL DEFAULT 'processed'
    CHECK (status IN ('processed', 'failed', 'ignored')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopify_webhooks_tenant ON public.shopify_webhook_events (tenant_id);
CREATE INDEX IF NOT EXISTS idx_shopify_webhooks_conn ON public.shopify_webhook_events (connection_id);
CREATE INDEX IF NOT EXISTS idx_shopify_webhooks_topic ON public.shopify_webhook_events (topic);

ALTER TABLE public.shopify_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopify_webhook_events FORCE ROW LEVEL SECURITY;

CREATE POLICY shopify_webhook_events_tenant_isolation ON public.shopify_webhook_events
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
