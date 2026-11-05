-- path: supabase/migrations/20261103000061_email_templates_and_logs.down.sql

DROP POLICY IF EXISTS email_send_logs_tenant_isolation ON public.email_send_logs;
DROP TABLE IF EXISTS public.email_send_logs CASCADE;

DROP POLICY IF EXISTS email_templates_tenant_isolation ON public.email_templates;
DROP TABLE IF EXISTS public.email_templates CASCADE;
