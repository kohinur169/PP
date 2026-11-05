-- path: db/migrations/050_merchant_api_keys.down.sql

DROP POLICY IF EXISTS merchant_api_keys_tenant_isolation ON public.merchant_api_keys;
DROP TABLE IF EXISTS public.merchant_api_keys CASCADE;
