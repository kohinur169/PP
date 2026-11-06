-- path: supabase/migrations/20261103000022_add_session_family_and_replay_detection.down.sql

-- ==============================================================================
-- KD SOLUTION IT: Rollback 20261103000022_add_session_family_and_replay_detection
-- Step 057: Rotating Session Tokens & Family Invalidation on Replay Detection
-- Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile
-- ==============================================================================

DROP INDEX IF EXISTS idx_sessions_is_consumed;
DROP INDEX IF EXISTS idx_sessions_family_revoked;
DROP INDEX IF EXISTS idx_sessions_family_id;

ALTER TABLE public.sessions
  DROP COLUMN IF EXISTS parent_session_id,
  DROP COLUMN IF EXISTS consumed_at,
  DROP COLUMN IF EXISTS is_consumed,
  DROP COLUMN IF EXISTS is_revoked,
  DROP COLUMN IF EXISTS session_family_id;
