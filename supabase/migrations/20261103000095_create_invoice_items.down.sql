-- path: supabase/migrations/20261103000095_create_invoice_items.down.sql

DROP POLICY IF EXISTS invoice_items_tenant_isolation ON public.invoice_items;
DROP TABLE IF EXISTS public.invoice_items CASCADE;
