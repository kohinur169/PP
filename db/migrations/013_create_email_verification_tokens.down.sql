-- path: db/migrations/013_create_email_verification_tokens.down.sql

-- ==============================================================================
-- KD SOLUTION IT: Rollback 013_create_email_verification_tokens
-- Step 048: Cryptographic Email Verification Token Engine
-- Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile
-- ==============================================================================

DROP TABLE IF EXISTS public.email_verification_tokens CASCADE;
