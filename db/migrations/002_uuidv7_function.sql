-- path: db/migrations/002_uuidv7_function.sql

-- ==============================================================================
-- KD SOLUTION IT: PostgreSQL RFC 9562 UUIDv7 Generator & Extractor Functions
-- Step 017: PostgreSQL UUIDv7 Extension & Generator Functions
-- Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines
-- ==============================================================================

-- 1. Ensure pgcrypto extension is active for gen_random_bytes
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. RFC 9562 UUIDv7 Generator Function
CREATE OR REPLACE FUNCTION generate_uuid_v7()
RETURNS uuid
AS $$
DECLARE
  unix_time_ms bigint;
  rand_bytes bytea;
  uuid_hex text;
BEGIN
  -- Extract 48-bit millisecond UNIX timestamp
  unix_time_ms := FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;

  -- Generate 10 cryptographically secure random bytes (80 bits)
  rand_bytes := gen_random_bytes(10);

  -- Assemble standard RFC 9562 UUIDv7 hex string:
  uuid_hex := LPAD(TO_HEX(unix_time_ms), 12, '0') ||
              '7' ||
              SUBSTR(ENCODE(rand_bytes, 'hex'), 1, 3) ||
              TO_HEX(8 + (GET_BYTE(rand_bytes, 2) & 3)::int) ||
              SUBSTR(ENCODE(rand_bytes, 'hex'), 4, 3) ||
              SUBSTR(ENCODE(rand_bytes, 'hex'), 7, 12);

  RETURN uuid_hex::uuid;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 3. Utility Function: Extract Timestamp from UUIDv7
CREATE OR REPLACE FUNCTION extract_uuid_v7_timestamp(uuid_val uuid)
RETURNS timestamptz
AS $$
DECLARE
  hex_prefix text;
  unix_time_ms bigint;
BEGIN
  IF uuid_val IS NULL THEN
    RETURN NULL;
  END IF;

  hex_prefix := SUBSTRING(REPLACE(uuid_val::text, '-', '') FROM 1 FOR 12);
  EXECUTE 'SELECT x''' || hex_prefix || '''::bigint' INTO unix_time_ms;

  RETURN to_timestamp(unix_time_ms / 1000.0);
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- 4. Utility Function: Validate RFC 9562 UUIDv7 Structure
CREATE OR REPLACE FUNCTION is_valid_uuid_v7(uuid_val uuid)
RETURNS boolean
AS $$
BEGIN
  IF uuid_val IS NULL THEN
    RETURN false;
  END IF;

  RETURN uuid_val::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;
