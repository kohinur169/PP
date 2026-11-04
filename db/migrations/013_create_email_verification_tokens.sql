-- path: db/migrations/013_create_email_verification_tokens.sql

-- ==============================================================================
-- KD SOLUTION IT: Cryptographic Email Verification Token Engine
-- Step 048: Cryptographic Email Verification Token Engine
-- Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile
-- ==============================================================================

-- 1. Create email_verification_tokens table
CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT generate_uuid_v7(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz NULL,
  version int NOT NULL DEFAULT 1
);

-- 2. Performance & Security Indexes
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id ON public.email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token_hash ON public.email_verification_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_pending ON public.email_verification_tokens(user_id, used_at, expires_at);

-- 3. Attach standard updated_at and version trigger
SELECT attach_standard_table_triggers('public.email_verification_tokens'::regclass);

-- 4. Enable and Force Row Level Security (RLS)
ALTER TABLE public.email_verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_verification_tokens FORCE ROW LEVEL SECURITY;

-- 5. User & System Isolation Policy
DROP POLICY IF EXISTS pol_email_verification_tokens_isolation ON public.email_verification_tokens;
CREATE POLICY pol_email_verification_tokens_isolation ON public.email_verification_tokens
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
