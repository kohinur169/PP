-- path: db/migrations/043_payment_velocity_records.down.sql

DROP POLICY IF EXISTS payment_velocity_records_tenant_isolation ON public.payment_velocity_records;
DROP TABLE IF EXISTS public.payment_velocity_records CASCADE;
