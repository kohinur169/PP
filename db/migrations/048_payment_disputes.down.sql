-- path: db/migrations/048_payment_disputes.down.sql

DROP POLICY IF EXISTS payment_disputes_tenant_isolation ON public.payment_disputes;
DROP TABLE IF EXISTS public.payment_disputes CASCADE;
