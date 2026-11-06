-- path: db/migrations/040_submerchant_verification_status.down.sql

DROP INDEX IF EXISTS idx_submerchants_verification_status;
ALTER TABLE public.submerchant_accounts DROP COLUMN IF EXISTS verification_status;
