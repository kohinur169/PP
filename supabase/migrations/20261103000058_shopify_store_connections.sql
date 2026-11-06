-- path: supabase/migrations/20261103000058_shopify_store_connections.sql

CREATE TABLE IF NOT EXISTS public.shopify_store_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  shop_domain VARCHAR(255) NOT NULL UNIQUE,
  encrypted_access_token TEXT NOT NULL,
  app_version VARCHAR(32) NOT NULL DEFAULT '1.0.0',
  status VARCHAR(32) NOT NULL DEFAULT 'active'
    CHECK (status IN ('installed', 'active', 'disabled', 'uninstalled')),
  is_functional BOOLEAN NOT NULL DEFAULT true,
  webhook_registered BOOLEAN NOT NULL DEFAULT true,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopify_connections_tenant ON public.shopify_store_connections (tenant_id);
CREATE INDEX IF NOT EXISTS idx_shopify_connections_company ON public.shopify_store_connections (company_id);
CREATE INDEX IF NOT EXISTS idx_shopify_connections_domain ON public.shopify_store_connections (shop_domain);
CREATE INDEX IF NOT EXISTS idx_shopify_connections_status ON public.shopify_store_connections (status);

ALTER TABLE public.shopify_store_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopify_store_connections FORCE ROW LEVEL SECURITY;

CREATE POLICY shopify_store_connections_tenant_isolation ON public.shopify_store_connections
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
