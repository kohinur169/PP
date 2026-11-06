-- path: db/migrations/020_create_password_reset_tokens.down.sql

-- ==============================================================================
-- KD SOLUTION IT: Rollback 020_create_password_reset_tokens
-- Step 060: Password Reset Flow with Turnstile & Lockout Immunity Guard
-- Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile
-- ==============================================================================

DROP TABLE IF EXISTS public.password_reset_tokens CASCADE;
