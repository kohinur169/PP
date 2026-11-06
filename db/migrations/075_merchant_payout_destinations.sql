-- path: db/migrations/075_merchant_payout_destinations.sql

-- Table for validated merchant payout destinations across ACH, Wire, SEPA, Payoneer, and Card OCT
CREATE TABLE IF NOT EXISTS public.merchant_payout_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  destination_type VARCHAR(32) NOT NULL
    CHECK (destination_type IN ('ach', 'wire', 'sepa', 'payoneer', 'card')),
  encrypted_details TEXT NOT NULL,
  masked_account_identifier VARCHAR(64) NOT NULL,
  beneficiary_name VARCHAR(255) NOT NULL,
  country_code VARCHAR(2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  validation_status VARCHAR(32) NOT NULL DEFAULT 'valid'
    CHECK (validation_status IN ('valid', 'invalid', 'pending_microdeposit')),
  validation_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_dest_tenant ON public.merchant_payout_destinations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_payout_dest_company ON public.merchant_payout_destinations (company_id);
CREATE INDEX IF NOT EXISTS idx_payout_dest_type ON public.merchant_payout_destinations (destination_type);

ALTER TABLE public.merchant_payout_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_payout_destinations FORCE ROW LEVEL SECURITY;

CREATE POLICY merchant_payout_destinations_tenant_isolation ON public.merchant_payout_destinations
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
