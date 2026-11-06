-- path: db/migrations/009_create_audit_logs_table.down.sql

-- ==============================================================================
-- KD SOLUTION IT: Rollback 009_create_audit_logs_table
-- Step 029: Database Migration Runner & Forward/Rollback Testing Harness
-- ==============================================================================

DROP TABLE IF EXISTS public.audit_logs CASCADE;
