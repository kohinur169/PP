-- path: db/migrations/085_woocommerce_plugin_health_logs.sql

-- Table for tracking WooCommerce plugin heartbeats, version telemetry, and diagnostic logs
CREATE TABLE IF NOT EXISTS public.woocommerce_plugin_health_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.woocommerce_store_connections(id) ON DELETE CASCADE,
  ping_type VARCHAR(32) NOT NULL
    CHECK (ping_type IN ('heartbeat', 'error_log', 'sync_check')),
  php_version VARCHAR(32),
  wp_version VARCHAR(32),
  wc_version VARCHAR(32),
  plugin_version VARCHAR(32) NOT NULL,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wc_health_tenant ON public.woocommerce_plugin_health_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_wc_health_conn ON public.woocommerce_plugin_health_logs (connection_id);
CREATE INDEX IF NOT EXISTS idx_wc_health_type ON public.woocommerce_plugin_health_logs (ping_type);

ALTER TABLE public.woocommerce_plugin_health_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.woocommerce_plugin_health_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY woocommerce_plugin_health_logs_tenant_isolation ON public.woocommerce_plugin_health_logs
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
