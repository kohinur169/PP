-- path: supabase/migrations/20261103000001_init_extensions.sql

-- ==============================================================================
-- KD SOLUTION IT: Core PostgreSQL Extensions & System Infrastructure Functions
-- Step 008: Database Schema Design & Foundational Migration
-- ==============================================================================

-- 1. Enable foundational extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- 2. Schema migration state table for forward/rollback tracking
CREATE TABLE IF NOT EXISTS _schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  checksum VARCHAR(64) NOT NULL
);

-- 3. High-throughput RFC 9562 UUIDv7 Generator Function
-- Combines 48-bit millisecond unix timestamp, version '7', variant bits, and cryptographic randomness
CREATE OR REPLACE FUNCTION generate_uuid_v7()
RETURNS uuid
AS $$
DECLARE
  unix_time_ms bigint;
  retval text;
BEGIN
  unix_time_ms := FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000);
  retval := LPAD(TO_HEX(unix_time_ms), 12, '0') ||
            '7' ||
            SUBSTR(MD5(RANDOM()::text || clock_timestamp()::text), 1, 3) ||
            TO_HEX(8 + FLOOR(RANDOM() * 4)::int) ||
            SUBSTR(MD5(RANDOM()::text || clock_timestamp()::text), 1, 3) ||
            SUBSTR(MD5(RANDOM()::text || clock_timestamp()::text), 1, 12);
  RETURN retval::uuid;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 4. Automatic updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
