-- path: supabase/migrations/20261103000078_cross_border_fee_breakdowns.sql

-- Table for itemized cross-border and interchange plus payment fee breakdowns
CREATE TABLE IF NOT EXISTS public.transaction_fee_breakdowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL,
  gross_amount_usd NUMERIC(18, 4) NOT NULL,
  is_cross_border BOOLEAN NOT NULL DEFAULT false,
  is_cross_currency BOOLEAN NOT NULL DEFAULT false,
  card_brand VARCHAR(32) NOT NULL,
  card_country VARCHAR(2) NOT NULL,
  merchant_country VARCHAR(2) NOT NULL,
  base_fee_usd NUMERIC(18, 4) NOT NULL,
  cross_border_assessment_usd NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  currency_conversion_assessment_usd NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  interchange_plus_usd NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  total_processor_fee_usd NUMERIC(18, 4) NOT NULL,
  net_amount_usd NUMERIC(18, 4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_breakdowns_tenant ON public.transaction_fee_breakdowns (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fee_breakdowns_payment ON public.transaction_fee_breakdowns (payment_id);

ALTER TABLE public.transaction_fee_breakdowns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_fee_breakdowns FORCE ROW LEVEL SECURITY;

CREATE POLICY transaction_fee_breakdowns_tenant_isolation ON public.transaction_fee_breakdowns
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
