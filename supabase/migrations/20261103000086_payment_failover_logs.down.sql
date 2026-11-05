-- path: supabase/migrations/20261103000086_payment_failover_logs.down.sql

DROP POLICY IF EXISTS payment_failover_logs_tenant_isolation ON public.payment_failover_logs;
DROP TABLE IF EXISTS public.payment_failover_logs CASCADE;
