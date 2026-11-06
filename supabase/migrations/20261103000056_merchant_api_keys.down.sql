-- path: supabase/migrations/20261103000056_merchant_api_keys.down.sql

DROP POLICY IF EXISTS merchant_api_keys_tenant_isolation ON public.merchant_api_keys;
DROP TABLE IF EXISTS public.merchant_api_keys CASCADE;
