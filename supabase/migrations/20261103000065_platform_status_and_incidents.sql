-- path: supabase/migrations/20261103000065_platform_status_and_incidents.sql

-- 1. Table for platform service states displayed on public status page
CREATE TABLE IF NOT EXISTS public.platform_service_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  service_key VARCHAR(64) NOT NULL,
  display_name VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'operational'
    CHECK (status IN ('operational', 'degraded_performance', 'partial_outage', 'major_outage', 'maintenance')),
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_service_states_tenant_key UNIQUE (tenant_id, service_key)
);

CREATE INDEX IF NOT EXISTS idx_platform_services_tenant ON public.platform_service_states (tenant_id);

ALTER TABLE public.platform_service_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_service_states FORCE ROW LEVEL SECURITY;

CREATE POLICY platform_service_states_tenant_isolation ON public.platform_service_states
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 2. Table for public incidents announced on status page and by email
CREATE TABLE IF NOT EXISTS public.platform_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  impact VARCHAR(32) NOT NULL DEFAULT 'minor'
    CHECK (impact IN ('none', 'minor', 'major', 'critical')),
  status VARCHAR(32) NOT NULL DEFAULT 'investigating'
    CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
  affected_service_keys TEXT[] NOT NULL DEFAULT '{}',
  resolved_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_incidents_tenant ON public.platform_incidents (tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_incidents_status ON public.platform_incidents (status);

ALTER TABLE public.platform_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_incidents FORCE ROW LEVEL SECURITY;

CREATE POLICY platform_incidents_tenant_isolation ON public.platform_incidents
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
