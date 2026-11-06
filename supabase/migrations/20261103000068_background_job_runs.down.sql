-- path: supabase/migrations/20261103000068_background_job_runs.down.sql

DROP POLICY IF EXISTS background_job_runs_tenant_isolation ON public.background_job_runs;
DROP TABLE IF EXISTS public.background_job_runs CASCADE;
