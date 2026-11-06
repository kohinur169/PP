-- path: supabase/migrations/20261103000054_payment_disputes.sql

CREATE TABLE IF NOT EXISTS public.payment_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL,
  amount NUMERIC(18,4) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  reason VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'needs_response'
    CHECK (status IN ('needs_response', 'under_review', 'evidence_submitted', 'won', 'lost', 'expired')),
  merchant_timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  deadline_hours INT NOT NULL DEFAULT 24
    CHECK (deadline_hours IN (24, 48)),
  deadline_at TIMESTAMPTZ NOT NULL,
  warning_start_sent_at TIMESTAMPTZ,
  warning_middle_sent_at TIMESTAMPTZ,
  gateway_dispute_id VARCHAR(128),
  evidence_submitted_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_disputes_tenant ON public.payment_disputes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_disputes_company ON public.payment_disputes (company_id);
CREATE INDEX IF NOT EXISTS idx_payment_disputes_payment ON public.payment_disputes (payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_disputes_status ON public.payment_disputes (status);
CREATE INDEX IF NOT EXISTS idx_payment_disputes_deadline ON public.payment_disputes (deadline_at);

ALTER TABLE public.payment_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_disputes FORCE ROW LEVEL SECURITY;

CREATE POLICY payment_disputes_tenant_isolation ON public.payment_disputes
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
