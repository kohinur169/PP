-- path: supabase/migrations/20261103000007_base_columns_and_triggers.sql

-- ==============================================================================
-- KD SOLUTION IT: Base Table Standard Columns & Timestamp Triggers
-- Step 018: Base Table Standard Columns & Timestamp Triggers Migration
-- Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines
-- ==============================================================================

-- 1. Reusable Timestamp & Optimistic Lock Version Trigger Function
-- Automatically sets updated_at to clock_timestamp() and increments version on UPDATE
-- Protects immutable base columns (id, company_id, created_at) against mutation
CREATE OR REPLACE FUNCTION update_timestamp_and_version()
RETURNS TRIGGER AS $$
BEGIN
  -- Advance updated_at to precise clock timestamp
  NEW.updated_at = clock_timestamp();

  -- Increment optimistic concurrency version counter
  NEW.version = OLD.version + 1;

  -- Enforce immutability of core structural attributes
  NEW.id = OLD.id;
  NEW.company_id = OLD.company_id;
  NEW.created_at = OLD.created_at;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Helper Function: Attach Standard Table Triggers
-- Binds the update_timestamp_and_version trigger to any target table
CREATE OR REPLACE FUNCTION attach_standard_table_triggers(target_table_regclass regclass)
RETURNS void AS $$
DECLARE
  target_name text;
  trigger_name text;
BEGIN
  target_name := target_table_regclass::text;
  trigger_name := 'trg_' || replace(target_name, '.', '_') || '_updated_at_version';

  EXECUTE format('
    DROP TRIGGER IF EXISTS %I ON %s;
    CREATE TRIGGER %I
    BEFORE UPDATE ON %s
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_and_version();
  ', trigger_name, target_name, trigger_name, target_name);
END;
$$ LANGUAGE plpgsql;

-- 3. Schema Inspection Helper: Validate Standard Columns
-- Verifies that a given table contains all 6 KD Solution IT mandatory columns:
-- id (uuid), company_id (uuid), created_at (timestamptz), updated_at (timestamptz), deleted_at (timestamptz), version (int)
CREATE OR REPLACE FUNCTION validate_table_has_base_columns(table_to_check text)
RETURNS boolean AS $$
DECLARE
  missing_count int;
BEGIN
  SELECT COUNT(*)
  INTO missing_count
  FROM (
    VALUES
      ('id', 'uuid'),
      ('company_id', 'uuid'),
      ('created_at', 'timestamp with time zone'),
      ('updated_at', 'timestamp with time zone'),
      ('deleted_at', 'timestamp with time zone'),
      ('version', 'integer')
  ) AS required_cols(col_name, col_type)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_name = table_to_check
      AND c.column_name = required_cols.col_name
  );

  RETURN (missing_count = 0);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION update_timestamp_and_version() IS 'Triggers updated_at clock advancement and optimistic locking version increment';
COMMENT ON FUNCTION attach_standard_table_triggers(regclass) IS 'Attaches standard update_timestamp_and_version trigger to a given table';
COMMENT ON FUNCTION validate_table_has_base_columns(text) IS 'Validates that a table schema complies with KD Solution IT base column standards';
