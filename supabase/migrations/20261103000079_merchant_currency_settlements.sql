-- path: supabase/migrations/20261103000079_merchant_currency_settlements.sql

-- Table for merchant preferred currency settlement conversions and ledger linking
CREATE TABLE IF NOT EXISTS public.merchant_currency_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  usd_amount NUMERIC(18, 4) NOT NULL,
  settlement_currency VARCHAR(3) NOT NULL,
  mid_market_rate NUMERIC(18, 6) NOT NULL,
  conversion_margin_pct NUMERIC(5, 2) NOT NULL DEFAULT 1.00,
  effective_fx_rate NUMERIC(18, 6) NOT NULL,
  settlement_amount NUMERIC(18, 4) NOT NULL,
  fx_margin_revenue_usd NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  status VARCHAR(32) NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending', 'completed', 'failed')),
  ledger_journal_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_curr_settlements_tenant ON public.merchant_currency_settlements (tenant_id);
CREATE INDEX IF NOT EXISTS idx_curr_settlements_company ON public.merchant_currency_settlements (company_id);
CREATE INDEX IF NOT EXISTS idx_curr_settlements_currency ON public.merchant_currency_settlements (settlement_currency);

ALTER TABLE public.merchant_currency_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_currency_settlements FORCE ROW LEVEL SECURITY;

CREATE POLICY merchant_currency_settlements_tenant_isolation ON public.merchant_currency_settlements
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
