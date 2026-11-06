-- path: db/migrations/031_sanctions_screening.down.sql

DROP POLICY IF EXISTS sanctions_screening_logs_tenant_isolation ON public.sanctions_screening_logs;
DROP TABLE IF EXISTS public.sanctions_screening_logs CASCADE;

DROP POLICY IF EXISTS sanctions_lists_read_all ON public.sanctions_lists;
DROP TABLE IF EXISTS public.sanctions_lists CASCADE;
