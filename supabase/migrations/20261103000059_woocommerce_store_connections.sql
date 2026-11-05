-- path: supabase/migrations/20261103000059_woocommerce_store_connections.sql

CREATE TABLE IF NOT EXISTS public.woocommerce_store_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  site_url VARCHAR(255) NOT NULL UNIQUE,
  encrypted_webhook_secret TEXT NOT NULL,
  plugin_version VARCHAR(32) NOT NULL DEFAULT '1.0.0',
  wc_version VARCHAR(32),
  status VARCHAR(32) NOT NULL DEFAULT 'active'
    CHECK (status IN ('installed', 'active', 'disabled', 'uninstalled')),
  is_functional BOOLEAN NOT NULL DEFAULT true,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_woocommerce_connections_tenant ON public.woocommerce_store_connections (tenant_id);
CREATE INDEX IF NOT EXISTS idx_woocommerce_connections_company ON public.woocommerce_store_connections (company_id);
CREATE INDEX IF NOT EXISTS idx_woocommerce_connections_url ON public.woocommerce_store_connections (site_url);
CREATE INDEX IF NOT EXISTS idx_woocommerce_connections_status ON public.woocommerce_store_connections (status);

ALTER TABLE public.woocommerce_store_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.woocommerce_store_connections FORCE ROW LEVEL SECURITY;

CREATE POLICY woocommerce_store_connections_tenant_isolation ON public.woocommerce_store_connections
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
