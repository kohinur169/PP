-- path: supabase/migrations/20261103000023_add_session_last_reauth_at.down.sql

-- ==============================================================================
-- KD SOLUTION IT: Rollback 20261103000023_add_session_last_reauth_at
-- Step 058: Step-Up Reauthentication Engine for Sensitive Office Operations
-- Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile
-- ==============================================================================

DROP INDEX IF EXISTS idx_sessions_last_reauth_at;
ALTER TABLE public.sessions DROP COLUMN IF EXISTS last_reauth_at;
