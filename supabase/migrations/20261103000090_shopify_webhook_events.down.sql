-- path: supabase/migrations/20261103000090_shopify_webhook_events.down.sql

DROP POLICY IF EXISTS shopify_webhook_events_tenant_isolation ON public.shopify_webhook_events;
DROP TABLE IF EXISTS public.shopify_webhook_events CASCADE;
