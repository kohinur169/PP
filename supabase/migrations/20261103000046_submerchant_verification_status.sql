-- path: supabase/migrations/20261103000046_submerchant_verification_status.sql

ALTER TABLE public.submerchant_accounts
  ADD COLUMN IF NOT EXISTS verification_status VARCHAR(32) NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'action_required', 'verified', 'restricted', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_submerchants_verification_status
  ON public.submerchant_accounts (verification_status);
