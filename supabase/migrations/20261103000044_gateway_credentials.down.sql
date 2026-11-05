-- path: supabase/migrations/20261103000044_gateway_credentials.down.sql

DROP POLICY IF EXISTS gateway_credentials_tenant_isolation ON public.gateway_credentials;
DROP TABLE IF EXISTS public.gateway_credentials CASCADE;
