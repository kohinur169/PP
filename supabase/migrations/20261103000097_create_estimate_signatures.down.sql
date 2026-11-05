-- path: supabase/migrations/20261103000097_create_estimate_signatures.down.sql

DROP POLICY IF EXISTS estimate_signatures_tenant_isolation ON public.estimate_signatures;
DROP TABLE IF EXISTS public.estimate_signatures CASCADE;
