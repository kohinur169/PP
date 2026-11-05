-- path: supabase/migrations/20261103000053_payment_refunds.down.sql

DROP POLICY IF EXISTS payment_refunds_tenant_isolation ON public.payment_refunds;
DROP TABLE IF EXISTS public.payment_refunds CASCADE;
