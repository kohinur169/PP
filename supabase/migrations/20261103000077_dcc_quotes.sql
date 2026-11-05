-- path: supabase/migrations/20261103000077_dcc_quotes.sql

-- Table for Dynamic Currency Conversion (DCC) checkout offers and choices
CREATE TABLE IF NOT EXISTS public.dcc_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_intent_id UUID NOT NULL,
  merchant_amount NUMERIC(18, 4) NOT NULL,
  merchant_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  cardholder_currency VARCHAR(3) NOT NULL,
  mid_market_rate NUMERIC(18, 6) NOT NULL,
  margin_percent NUMERIC(5, 2) NOT NULL,
  customer_rate NUMERIC(18, 6) NOT NULL,
  cardholder_amount NUMERIC(18, 4) NOT NULL,
  markup_amount_usd NUMERIC(18, 4) NOT NULL,
  is_accepted BOOLEAN,
  expires_at TIMESTAMPTZ NOT NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dcc_quotes_tenant ON public.dcc_quotes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_dcc_quotes_payment ON public.dcc_quotes (payment_intent_id);

ALTER TABLE public.dcc_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dcc_quotes FORCE ROW LEVEL SECURITY;

CREATE POLICY dcc_quotes_tenant_isolation ON public.dcc_quotes
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
