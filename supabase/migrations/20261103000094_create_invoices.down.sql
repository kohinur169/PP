-- path: supabase/migrations/20261103000094_create_invoices.down.sql

DROP POLICY IF EXISTS invoices_tenant_isolation ON public.invoices;
DROP TABLE IF EXISTS public.invoices CASCADE;
