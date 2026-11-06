-- path: supabase/migrations/20261103000074_merchant_outbound_webhooks.down.sql

DROP POLICY IF EXISTS merchant_webhook_deliveries_tenant_isolation ON public.merchant_webhook_deliveries;
DROP TABLE IF EXISTS public.merchant_webhook_deliveries CASCADE;

DROP POLICY IF EXISTS merchant_webhook_endpoints_tenant_isolation ON public.merchant_webhook_endpoints;
DROP TABLE IF EXISTS public.merchant_webhook_endpoints CASCADE;
