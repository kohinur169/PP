-- path: db/migrations/018_add_session_family_and_replay_detection.sql

-- ==============================================================================
-- KD SOLUTION IT: Session Family Lineage & Replay Invalidation Migration
-- Step 057: Rotating Session Tokens & Family Invalidation on Replay Detection
-- Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile
-- ==============================================================================

-- 1. Add session family lineage and token consumption columns to sessions table
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS session_family_id uuid NOT NULL DEFAULT generate_uuid_v7(),
  ADD COLUMN IF NOT EXISTS is_revoked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_consumed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS parent_session_id uuid NULL REFERENCES public.sessions(id) ON DELETE SET NULL;

-- 2. Performance & Audit Indexes for Replay Detection
CREATE INDEX IF NOT EXISTS idx_sessions_family_id ON public.sessions(session_family_id);
CREATE INDEX IF NOT EXISTS idx_sessions_family_revoked ON public.sessions(session_family_id, is_revoked);
CREATE INDEX IF NOT EXISTS idx_sessions_is_consumed ON public.sessions(is_consumed);
