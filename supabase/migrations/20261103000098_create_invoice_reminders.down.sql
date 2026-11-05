-- path: supabase/migrations/20261103000098_create_invoice_reminders.down.sql

DROP POLICY IF EXISTS invoice_reminders_tenant_isolation ON public.invoice_reminders;
DROP TABLE IF EXISTS public.invoice_reminders CASCADE;
