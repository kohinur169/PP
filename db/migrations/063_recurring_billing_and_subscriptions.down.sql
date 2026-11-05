-- path: db/migrations/063_recurring_billing_and_subscriptions.down.sql

DROP POLICY IF EXISTS merchant_platform_subscriptions_tenant_isolation ON public.merchant_platform_subscriptions;
DROP TABLE IF EXISTS public.merchant_platform_subscriptions CASCADE;

DROP POLICY IF EXISTS recurring_invoices_tenant_isolation ON public.recurring_invoices;
DROP TABLE IF EXISTS public.recurring_invoices CASCADE;
