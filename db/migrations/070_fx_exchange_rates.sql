-- path: db/migrations/070_fx_exchange_rates.sql

-- Table for FX exchange rates with mid-market rate, configurable margin and customer rate
CREATE TABLE IF NOT EXISTS public.fx_exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  base_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  target_currency VARCHAR(3) NOT NULL,
  mid_market_rate NUMERIC(18, 6) NOT NULL,
  customer_rate NUMERIC(18, 6) NOT NULL,
  margin_percent NUMERIC(5, 2) NOT NULL DEFAULT 1.50,
  feed_source VARCHAR(64) NOT NULL DEFAULT 'ECB',
  rate_date DATE NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_fx_rate_tenant_pair_date UNIQUE (tenant_id, base_currency, target_currency, rate_date)
);

CREATE INDEX IF NOT EXISTS idx_fx_rates_tenant ON public.fx_exchange_rates (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fx_rates_pair ON public.fx_exchange_rates (base_currency, target_currency);
CREATE INDEX IF NOT EXISTS idx_fx_rates_date ON public.fx_exchange_rates (rate_date);

ALTER TABLE public.fx_exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fx_exchange_rates FORCE ROW LEVEL SECURITY;

CREATE POLICY fx_exchange_rates_tenant_isolation ON public.fx_exchange_rates
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
