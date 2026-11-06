-- path: db/migrations/036_re_kyc_schedules.down.sql

DROP POLICY IF EXISTS re_kyc_schedules_tenant_isolation ON public.re_kyc_schedules;
DROP TABLE IF EXISTS public.re_kyc_schedules CASCADE;
