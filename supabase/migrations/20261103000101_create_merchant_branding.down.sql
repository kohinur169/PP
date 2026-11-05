-- path: supabase/migrations/20261103000101_create_merchant_branding.down.sql

DROP POLICY IF EXISTS merchant_branding_tenant_isolation ON public.merchant_branding;
DROP TABLE IF EXISTS public.merchant_branding CASCADE;
