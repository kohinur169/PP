-- path: db/migrations/015_office_2fa_resets.down.sql

-- ==============================================================================
-- KD SOLUTION IT: Rollback 015_office_2fa_resets
-- Step 054: Office 2FA Reset Workflow for Lost Credentials
-- Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile
-- ==============================================================================

DROP TABLE IF EXISTS public.office_2fa_reset_requests CASCADE;
ALTER TABLE public.users DROP COLUMN IF EXISTS must_setup_2fa;
