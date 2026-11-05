-- path: db/migrations/091_create_estimate_signatures.down.sql

DROP POLICY IF EXISTS estimate_signatures_tenant_isolation ON public.estimate_signatures;
DROP TABLE IF EXISTS public.estimate_signatures CASCADE;
