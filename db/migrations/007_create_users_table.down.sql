-- path: db/migrations/007_create_users_table.down.sql

-- ==============================================================================
-- KD SOLUTION IT: Rollback 007_create_users_table
-- Step 029: Database Migration Runner & Forward/Rollback Testing Harness
-- ==============================================================================

DROP TABLE IF EXISTS public.users CASCADE;
