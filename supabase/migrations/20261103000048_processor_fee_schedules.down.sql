-- path: supabase/migrations/20261103000048_processor_fee_schedules.down.sql

DROP POLICY IF EXISTS processor_fee_schedules_tenant_isolation ON public.processor_fee_schedules;
DROP TABLE IF EXISTS public.processor_fee_schedules CASCADE;
