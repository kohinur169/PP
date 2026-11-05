-- path: db/migrations/035_sar_cases.down.sql

DROP POLICY IF EXISTS sar_cases_tenant_isolation ON public.sar_cases;
DROP TABLE IF EXISTS public.sar_cases CASCADE;
