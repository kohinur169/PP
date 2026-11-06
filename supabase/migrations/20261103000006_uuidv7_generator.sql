-- path: supabase/migrations/20261103000006_uuidv7_generator.sql

-- ==============================================================================
-- KD SOLUTION IT: PostgreSQL RFC 9562 UUIDv7 Generator & Extractor Functions
-- Step 017: PostgreSQL UUIDv7 Extension & Generator Functions
-- Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines
-- ==============================================================================

-- 1. Ensure pgcrypto extension is active for gen_random_bytes
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Enhanced RFC 9562 UUIDv7 Generator Function
-- Combines 48-bit UNIX millisecond timestamp with version 7 ('0111'),
-- variant bits ('10xx'), and cryptographically secure random bytes (pgcrypto).
-- Provides perfect chronological B-tree index clustering and zero fragmentation.
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
  -- [48-bit timestamp = 12 hex] - [version 7 + 12-bit rand_a = 4 hex] - [variant + 14-bit rand_b = 4 hex] - [48-bit rand_b = 12 hex]
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
-- Decodes the leading 48 bits of a UUIDv7 into a PostgreSQL timestamptz
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

  -- First 12 hex digits encode the 48-bit millisecond UNIX timestamp
  hex_prefix := SUBSTRING(REPLACE(uuid_val::text, '-', '') FROM 1 FOR 12);
  EXECUTE 'SELECT x''' || hex_prefix || '''::bigint' INTO unix_time_ms;

  RETURN to_timestamp(unix_time_ms / 1000.0);
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- 4. Utility Function: Validate RFC 9562 UUIDv7 Structure
-- Confirms version nibble is '7' and variant nibble is in ['8', '9', 'a', 'b']
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

-- Comment on database functions for PostgreSQL schema catalog
COMMENT ON FUNCTION generate_uuid_v7() IS 'Generates RFC 9562 compliant time-ordered UUIDv7 with 48-bit timestamp and pgcrypto randomness';
COMMENT ON FUNCTION extract_uuid_v7_timestamp(uuid) IS 'Extracts timestamptz from RFC 9562 UUIDv7 leading 48-bit timestamp';
COMMENT ON FUNCTION is_valid_uuid_v7(uuid) IS 'Validates RFC 9562 UUIDv7 compliance (version 7 and variant 10xx)';
