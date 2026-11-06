-- path: supabase/migrations/20261103000038_pep_screening.down.sql

DROP POLICY IF EXISTS pep_screening_cases_tenant_isolation ON public.pep_screening_cases;
DROP TABLE IF EXISTS public.pep_screening_cases CASCADE;
