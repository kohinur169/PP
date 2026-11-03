-- path: db/migrations/003_base_columns_and_triggers.down.sql

-- ==============================================================================
-- KD SOLUTION IT: Rollback 003_base_columns_and_triggers
-- Step 029: Database Migration Runner & Forward/Rollback Testing Harness
-- ==============================================================================

DROP FUNCTION IF EXISTS public.attach_standard_table_triggers(regclass);
DROP FUNCTION IF EXISTS public.trigger_set_updated_at_and_version();
