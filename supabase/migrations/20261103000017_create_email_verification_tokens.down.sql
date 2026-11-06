-- path: supabase/migrations/20261103000017_create_email_verification_tokens.down.sql

-- ==============================================================================
-- KD SOLUTION IT: Rollback 20261103000017_create_email_verification_tokens
-- Step 048: Cryptographic Email Verification Token Engine
-- Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile
-- ==============================================================================

DROP TABLE IF EXISTS public.email_verification_tokens CASCADE;
