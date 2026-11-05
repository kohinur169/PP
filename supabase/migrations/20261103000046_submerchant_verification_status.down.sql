-- path: supabase/migrations/20261103000046_submerchant_verification_status.down.sql

DROP INDEX IF EXISTS idx_submerchants_verification_status;
ALTER TABLE public.submerchant_accounts DROP COLUMN IF EXISTS verification_status;
