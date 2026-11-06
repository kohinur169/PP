-- path: db/migrations/053_woocommerce_store_connections.down.sql

DROP POLICY IF EXISTS woocommerce_store_connections_tenant_isolation ON public.woocommerce_store_connections;
DROP TABLE IF EXISTS public.woocommerce_store_connections CASCADE;
