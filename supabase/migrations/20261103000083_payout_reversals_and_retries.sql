-- path: supabase/migrations/20261103000083_payout_reversals_and_retries.sql

-- Table for tracking clearing network returns, reversals, and retries
CREATE TABLE IF NOT EXISTS public.payout_return_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.mass_payout_batches(id) ON DELETE CASCADE,
  payout_item_id UUID NOT NULL REFERENCES public.mass_payout_items(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  return_code VARCHAR(16) NOT NULL,
  return_reason TEXT NOT NULL,
  reversal_amount_usd NUMERIC(18, 4) NOT NULL,
  reversal_ledger_journal_id UUID,
  retry_count INT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'reversed'
    CHECK (status IN ('reversed', 'retried', 'abandoned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_returns_tenant ON public.payout_return_events (tenant_id);
CREATE INDEX IF NOT EXISTS idx_payout_returns_batch ON public.payout_return_events (batch_id);
CREATE INDEX IF NOT EXISTS idx_payout_returns_item ON public.payout_return_events (payout_item_id);
CREATE INDEX IF NOT EXISTS idx_payout_returns_company ON public.payout_return_events (company_id);

ALTER TABLE public.payout_return_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_return_events FORCE ROW LEVEL SECURITY;

CREATE POLICY payout_return_events_tenant_isolation ON public.payout_return_events
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
