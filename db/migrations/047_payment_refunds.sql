-- path: db/migrations/047_payment_refunds.sql

CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL,
  amount NUMERIC(18,4) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  reason TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'pending_approval', 'approved', 'processing', 'succeeded', 'failed', 'rejected')),
  is_platform_fee_refunded BOOLEAN NOT NULL DEFAULT false,
  platform_fee_refunded_amount NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
  requested_by UUID NOT NULL REFERENCES public.users(id),
  approved_by UUID REFERENCES public.users(id),
  rejection_reason TEXT,
  gateway_refund_id VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_tenant ON public.payment_refunds (tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_company ON public.payment_refunds (company_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment ON public.payment_refunds (payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_status ON public.payment_refunds (status);

ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_refunds FORCE ROW LEVEL SECURITY;

CREATE POLICY payment_refunds_tenant_isolation ON public.payment_refunds
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
