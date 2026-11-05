-- path: db/migrations/047_payment_refunds.down.sql

DROP POLICY IF EXISTS payment_refunds_tenant_isolation ON public.payment_refunds;
DROP TABLE IF EXISTS public.payment_refunds CASCADE;
