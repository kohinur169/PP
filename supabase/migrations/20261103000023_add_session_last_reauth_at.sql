-- path: supabase/migrations/20261103000023_add_session_last_reauth_at.sql

-- ==============================================================================
-- KD SOLUTION IT: Session Step-Up Reauthentication Timestamp Migration
-- Step 058: Step-Up Reauthentication Engine for Sensitive Office Operations
-- Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile
-- ==============================================================================

-- 1. Add last_reauth_at timestamp column to sessions table
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS last_reauth_at timestamptz NULL;

-- 2. Performance Index for Step-Up Reauthentication Checking
CREATE INDEX IF NOT EXISTS idx_sessions_last_reauth_at ON public.sessions(last_reauth_at);
