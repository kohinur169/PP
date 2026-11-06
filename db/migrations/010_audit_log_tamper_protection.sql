-- path: db/migrations/010_audit_log_tamper_protection.sql

-- ==============================================================================
-- KD SOLUTION IT: Audit Log Tamper-Proofing Database Rules & Triggers
-- Step 025: Audit Log Tamper-Proofing Database Rules & Triggers
-- Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines
-- ==============================================================================

-- 1. Create trigger function to enforce strict append-only immutability
CREATE OR REPLACE FUNCTION public.prevent_audit_log_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are strictly append-only. UPDATE, DELETE, and TRUNCATE operations are forbidden.'
    USING ERRCODE = 'restrict_violation',
          HINT = 'Audit entries cannot be modified or deleted.';
  RETURN NULL;
END;
$$;

-- 2. Step 025.1: Install BEFORE UPDATE trigger raising exception
DROP TRIGGER IF EXISTS trg_audit_logs_prevent_update ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_prevent_update
BEFORE UPDATE ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_audit_log_modification();

-- 3. Step 025.2: Install BEFORE DELETE trigger raising exception
DROP TRIGGER IF EXISTS trg_audit_logs_prevent_delete ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_prevent_delete
BEFORE DELETE ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_audit_log_modification();

-- 4. Install BEFORE TRUNCATE trigger raising exception
DROP TRIGGER IF EXISTS trg_audit_logs_prevent_truncate ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_prevent_truncate
BEFORE TRUNCATE ON public.audit_logs
FOR EACH STATEMENT
EXECUTE FUNCTION public.prevent_audit_log_modification();

-- 5. Step 025.3: Revoke TRUNCATE privileges on audit_logs from public, anon, authenticated
REVOKE TRUNCATE ON public.audit_logs FROM PUBLIC;
REVOKE TRUNCATE ON public.audit_logs FROM anon;
REVOKE TRUNCATE ON public.audit_logs FROM authenticated;
