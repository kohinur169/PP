-- path: db/migrations/014_create_backup_codes_table.down.sql

-- ==============================================================================
-- KD SOLUTION IT: Rollback 014_create_backup_codes_table
-- Step 053: Encrypted Backup Codes Generation & Single-Use Consumption
-- Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile
-- ==============================================================================

DROP TABLE IF EXISTS public.user_backup_codes CASCADE;
