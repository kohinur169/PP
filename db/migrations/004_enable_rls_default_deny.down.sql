-- path: db/migrations/004_enable_rls_default_deny.down.sql

-- ==============================================================================
-- KD SOLUTION IT: Rollback 004_enable_rls_default_deny
-- Step 029: Database Migration Runner & Forward/Rollback Testing Harness
-- ==============================================================================

DROP FUNCTION IF EXISTS public.enable_and_force_rls(regclass);
