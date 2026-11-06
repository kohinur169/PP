-- path: db/migrations/002_uuidv7_function.down.sql

-- ==============================================================================
-- KD SOLUTION IT: Rollback 002_uuidv7_function
-- Step 029: Database Migration Runner & Forward/Rollback Testing Harness
-- ==============================================================================

DROP FUNCTION IF EXISTS public.generate_uuid_v7();
