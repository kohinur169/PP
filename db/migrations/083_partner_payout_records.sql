-- path: db/migrations/083_partner_payout_records.sql

-- Table for partner commission payout distributions and clearing ledger linkage
CREATE TABLE IF NOT EXISTS public.partner_payout_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  commission_id UUID NOT NULL REFERENCES public.partner_monthly_commissions(id) ON DELETE CASCADE,
  payout_batch_id UUID REFERENCES public.mass_payout_batches(id),
  payout_amount_usd NUMERIC(18, 4) NOT NULL,
  destination_type VARCHAR(32) NOT NULL,
  destination_masked VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  ledger_clearing_journal_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_payout_tenant ON public.partner_payout_records (tenant_id);
CREATE INDEX IF NOT EXISTS idx_partner_payout_partner ON public.partner_payout_records (partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_payout_batch ON public.partner_payout_records (payout_batch_id);

ALTER TABLE public.partner_payout_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_payout_records FORCE ROW LEVEL SECURITY;

CREATE POLICY partner_payout_records_tenant_isolation ON public.partner_payout_records
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
