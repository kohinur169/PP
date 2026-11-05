-- path: supabase/migrations/20261103000072_monthly_volume_counters_and_tier_recalculation.sql

-- 1. Merchant monthly volume counters with idempotent period boundaries
CREATE TABLE IF NOT EXISTS public.merchant_monthly_volume_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_month VARCHAR(7) NOT NULL, -- Format YYYY-MM
  processed_volume_usd NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  transaction_count INT NOT NULL DEFAULT 0,
  chargeback_count INT NOT NULL DEFAULT 0,
  chargeback_volume_usd NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  is_period_closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_merchant_period_month UNIQUE (tenant_id, company_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_vol_tenant ON public.merchant_monthly_volume_counters (tenant_id);
CREATE INDEX IF NOT EXISTS idx_monthly_vol_company ON public.merchant_monthly_volume_counters (company_id);
CREATE INDEX IF NOT EXISTS idx_monthly_vol_period ON public.merchant_monthly_volume_counters (period_month);

ALTER TABLE public.merchant_monthly_volume_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_monthly_volume_counters FORCE ROW LEVEL SECURITY;

CREATE POLICY merchant_monthly_volume_counters_tenant_isolation ON public.merchant_monthly_volume_counters
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 2. Tier recalculation and risk limit audit logs
CREATE TABLE IF NOT EXISTS public.tier_recalculation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  previous_tier INT NOT NULL CHECK (previous_tier IN (1, 2, 3)),
  new_tier INT NOT NULL CHECK (new_tier IN (1, 2, 3)),
  reason VARCHAR(64) NOT NULL,
  trailing_volume_avg_usd NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  chargeback_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  action_taken VARCHAR(32) NOT NULL
    CHECK (action_taken IN ('UPGRADED', 'DOWNGRADED', 'MAINTAINED', 'MANUAL_REVIEW_FLAGGED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tier_recalc_tenant ON public.tier_recalculation_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tier_recalc_company ON public.tier_recalculation_logs (company_id);

ALTER TABLE public.tier_recalculation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tier_recalculation_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY tier_recalculation_logs_tenant_isolation ON public.tier_recalculation_logs
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
