-- path: db/migrations/041_webhook_events.sql

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL
    CHECK (provider IN ('nmi', 'stripe_connect', 'rainforest', 'airwallex', 'payoneer')),
  event_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  lock_expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unq_provider_event UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_tenant ON public.webhook_events (tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON public.webhook_events (status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON public.webhook_events (provider);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events FORCE ROW LEVEL SECURITY;

CREATE POLICY webhook_events_tenant_isolation ON public.webhook_events
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
