-- path: db/migrations/064_settlement_batches_and_fulfilment_gates.sql

CREATE TABLE IF NOT EXISTS public.merchant_settlement_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  batch_reference VARCHAR(64) NOT NULL UNIQUE,
  amount_usd NUMERIC(18,4) NOT NULL,
  reserve_amount_usd NUMERIC(18,4) NOT NULL,
  net_payout_amount_usd NUMERIC(18,4) NOT NULL,
  tier INT NOT NULL CHECK (tier IN (1, 2, 3)),
  status VARCHAR(32) NOT NULL DEFAULT 'held'
    CHECK (status IN ('held', 'pending_proof', 'pending_manual_review', 'eligible_for_payout', 'released', 'disbursed')),
  has_verified_delivery_proof BOOLEAN NOT NULL DEFAULT false,
  delivery_verified_at TIMESTAMPTZ,
  manual_review_status VARCHAR(32) NOT NULL DEFAULT 'not_required'
    CHECK (manual_review_status IN ('not_required', 'pending', 'approved', 'rejected')),
  reserve_hold_days INT NOT NULL,
  reserve_maturation_date DATE NOT NULL,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlements_tenant ON public.merchant_settlement_batches (tenant_id);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON public.merchant_settlement_batches (status);

ALTER TABLE public.merchant_settlement_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_settlement_batches FORCE ROW LEVEL SECURITY;

CREATE POLICY merchant_settlement_batches_tenant_isolation ON public.merchant_settlement_batches
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
