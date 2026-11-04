-- path: supabase/migrations/20261103000018_create_backup_codes_table.sql

-- ==============================================================================
-- KD SOLUTION IT: Single-Use Encrypted 2FA Backup Recovery Codes Engine
-- Step 053: Encrypted Backup Codes Generation & Single-Use Consumption
-- Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile
-- ==============================================================================

-- 1. Create user_backup_codes table
CREATE TABLE IF NOT EXISTS public.user_backup_codes (
  id uuid PRIMARY KEY DEFAULT generate_uuid_v7(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  company_id uuid NULL,
  code_hash varchar(255) NOT NULL,
  used_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz NULL,
  version int NOT NULL DEFAULT 1
);

-- 2. Performance & Security Indexes
CREATE INDEX IF NOT EXISTS idx_user_backup_codes_user_id ON public.user_backup_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_backup_codes_active ON public.user_backup_codes(user_id, used_at) WHERE used_at IS NULL AND deleted_at IS NULL;

-- 3. Attach standard updated_at and version trigger
SELECT attach_standard_table_triggers('public.user_backup_codes'::regclass);

-- 4. Enable and Force Row Level Security (RLS)
ALTER TABLE public.user_backup_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_backup_codes FORCE ROW LEVEL SECURITY;

-- 5. User & System Isolation Policy
DROP POLICY IF EXISTS pol_user_backup_codes_isolation ON public.user_backup_codes;
CREATE POLICY pol_user_backup_codes_isolation ON public.user_backup_codes
FOR ALL TO PUBLIC
USING (
  is_current_superadmin()
  OR
  user_id::text = current_setting('app.current_user_id', true)
)
WITH CHECK (
  is_current_superadmin()
  OR
  user_id::text = current_setting('app.current_user_id', true)
);
