-- path: supabase/migrations/20261103000034_merchant_websites.down.sql

DROP POLICY IF EXISTS merchant_websites_tenant_isolation ON public.merchant_websites;
DROP TABLE IF EXISTS public.merchant_websites CASCADE;
