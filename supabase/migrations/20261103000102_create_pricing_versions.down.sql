-- path: supabase/migrations/20261103000102_create_pricing_versions.down.sql

DROP POLICY IF EXISTS pricing_versions_tenant_isolation ON public.pricing_versions;
DROP TABLE IF EXISTS public.pricing_versions CASCADE;
