-- path: supabase/migrations/20261103000014_audit_log_tamper_protection.down.sql
DROP TRIGGER IF EXISTS trg_audit_logs_prevent_update ON public.audit_logs;
DROP TRIGGER IF EXISTS trg_audit_logs_prevent_delete ON public.audit_logs;
DROP TRIGGER IF EXISTS trg_audit_logs_prevent_truncate ON public.audit_logs;
DROP FUNCTION IF EXISTS public.prevent_audit_log_modification();
