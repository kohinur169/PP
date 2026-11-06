-- path: db/migrations/003_base_columns_and_triggers.sql

-- ==============================================================================
-- KD SOLUTION IT: Base Table Standard Columns & Timestamp Triggers
-- Step 018: Base Table Standard Columns & Timestamp Triggers Migration
-- Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines
-- ==============================================================================

-- 1. Reusable Timestamp & Optimistic Lock Version Trigger Function
CREATE OR REPLACE FUNCTION update_timestamp_and_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  NEW.version = OLD.version + 1;
  NEW.id = OLD.id;
  NEW.company_id = OLD.company_id;
  NEW.created_at = OLD.created_at;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Helper Function: Attach Standard Table Triggers
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
