-- path: supabase/migrations/20261103000035_beneficial_owners.down.sql

DROP POLICY IF EXISTS ubo_tenant_isolation ON public.company_beneficial_owners;
DROP TABLE IF EXISTS public.company_beneficial_owners CASCADE;
