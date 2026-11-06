-- path: db/migrations/006_create_companies_table.down.sql

-- ==============================================================================
-- KD SOLUTION IT: Rollback 006_create_companies_table
-- Step 029: Database Migration Runner & Forward/Rollback Testing Harness
-- ==============================================================================

DROP TABLE IF EXISTS public.companies CASCADE;
