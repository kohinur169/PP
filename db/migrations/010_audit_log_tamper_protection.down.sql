-- path: db/migrations/010_audit_log_tamper_protection.down.sql

-- ==============================================================================
-- KD SOLUTION IT: Rollback 010_audit_log_tamper_protection
-- Step 029: Database Migration Runner & Forward/Rollback Testing Harness
-- ==============================================================================

DROP TRIGGER IF EXISTS trg_audit_logs_prevent_update ON public.audit_logs;
DROP TRIGGER IF EXISTS trg_audit_logs_prevent_delete ON public.audit_logs;
DROP TRIGGER IF EXISTS trg_audit_logs_prevent_truncate ON public.audit_logs;
DROP FUNCTION IF EXISTS public.prevent_audit_log_modification();
