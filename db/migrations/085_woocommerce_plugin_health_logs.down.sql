-- path: db/migrations/085_woocommerce_plugin_health_logs.down.sql

DROP POLICY IF EXISTS woocommerce_plugin_health_logs_tenant_isolation ON public.woocommerce_plugin_health_logs;
DROP TABLE IF EXISTS public.woocommerce_plugin_health_logs CASCADE;
