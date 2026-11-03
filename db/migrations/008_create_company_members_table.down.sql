-- path: db/migrations/008_create_company_members_table.down.sql

-- ==============================================================================
-- KD SOLUTION IT: Rollback 008_create_company_members_table
-- Step 029: Database Migration Runner & Forward/Rollback Testing Harness
-- ==============================================================================

DROP TABLE IF EXISTS public.company_members CASCADE;
