-- path: supabase/migrations/20261103000011_create_users_table.sql

-- ==============================================================================
-- KD SOLUTION IT: Users & Staff Identities Schema Migration
-- Step 022: Users & Staff Identities Schema Migration
-- Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines
-- ==============================================================================

-- 1. Ensure users table exists with base columns
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT generate_uuid_v7(),
  company_id uuid NULL,
  email text NOT NULL,
  phone text NULL,
  full_name text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz NULL,
  version int NOT NULL DEFAULT 1
);

-- 2. Add complete user security, identity, and lockout fields
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS full_legal_name varchar(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone_hash varchar(64) NULL,
  ADD COLUMN IF NOT EXISTS failed_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz NULL,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN IF NOT EXISTS is_staff boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status varchar(50) NOT NULL DEFAULT 'pending_verification';

-- 3. Add Domain Constraints (Status check)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_status') THEN
    ALTER TABLE public.users ADD CONSTRAINT chk_users_status CHECK (status IN ('pending_verification', 'active', 'locked', 'suspended'));
  END IF;
END;
$$;

-- 4. Create Performance B-Tree & Unique Lowercase Email Indexes
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower ON public.users(LOWER(email)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_phone_hash ON public.users(phone_hash);
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status);
CREATE INDEX IF NOT EXISTS idx_users_is_staff ON public.users(is_staff);

-- 5. Attach Automated updated_at and Version Triggers
SELECT attach_standard_table_triggers('public.users'::regclass);

-- 6. Enable and Force Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

-- 7. Define User Self-Identity Isolation RLS Policy
DROP POLICY IF EXISTS pol_users_self_isolation ON public.users;
CREATE POLICY pol_users_self_isolation ON public.users
FOR ALL TO PUBLIC
USING (
  is_current_superadmin()
  OR
  id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
)
WITH CHECK (
  is_current_superadmin()
  OR
  id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
);

COMMENT ON TABLE public.users IS 'Global user identities including merchant owners and platform staff with account lockout counters and security metadata';
