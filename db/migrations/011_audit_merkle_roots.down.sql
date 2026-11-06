-- path: db/migrations/011_audit_merkle_roots.down.sql

-- ==============================================================================
-- KD SOLUTION IT: Rollback 011_audit_merkle_roots
-- Step 029: Database Migration Runner & Forward/Rollback Testing Harness
-- ==============================================================================

DROP TABLE IF EXISTS public.audit_merkle_roots CASCADE;
