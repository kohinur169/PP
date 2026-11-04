-- path: db/migrations/016_create_sessions_table.down.sql

-- ==============================================================================
-- KD SOLUTION IT: Rollback 016_create_sessions_table
-- Step 055: LR-022 Session Engine with HttpOnly Secure SameSite=Strict Cookies
-- Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile
-- ==============================================================================

DROP POLICY IF EXISTS pol_sessions_isolation ON public.sessions;
DROP TRIGGER IF EXISTS trg_sessions_sync_session_id ON public.sessions;
DROP FUNCTION IF EXISTS sync_sessions_session_id();
DROP TABLE IF EXISTS public.sessions CASCADE;
