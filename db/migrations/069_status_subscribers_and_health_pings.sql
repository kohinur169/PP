-- path: db/migrations/069_status_subscribers_and_health_pings.sql

-- 1. Table for email subscribers to platform status notifications
CREATE TABLE IF NOT EXISTS public.status_page_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_status_subscriber UNIQUE (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_status_sub_tenant ON public.status_page_subscribers (tenant_id);

ALTER TABLE public.status_page_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_page_subscribers FORCE ROW LEVEL SECURITY;

CREATE POLICY status_page_subscribers_tenant_isolation ON public.status_page_subscribers
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 2. Table for synthetic health check ping logs used to calculate rolling uptime
CREATE TABLE IF NOT EXISTS public.synthetic_health_pings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  service_key VARCHAR(64) NOT NULL,
  is_success BOOLEAN NOT NULL,
  latency_ms INT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_pings_tenant ON public.synthetic_health_pings (tenant_id);
CREATE INDEX IF NOT EXISTS idx_health_pings_service ON public.synthetic_health_pings (service_key);
CREATE INDEX IF NOT EXISTS idx_health_pings_created ON public.synthetic_health_pings (created_at);

ALTER TABLE public.synthetic_health_pings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.synthetic_health_pings FORCE ROW LEVEL SECURITY;

CREATE POLICY synthetic_health_pings_tenant_isolation ON public.synthetic_health_pings
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
