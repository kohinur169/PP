-- path: db/migrations/052_shopify_store_connections.down.sql

DROP POLICY IF EXISTS shopify_store_connections_tenant_isolation ON public.shopify_store_connections;
DROP TABLE IF EXISTS public.shopify_store_connections CASCADE;
