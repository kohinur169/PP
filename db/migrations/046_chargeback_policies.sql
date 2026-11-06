-- path: db/migrations/046_chargeback_policies.sql

-- 1. Table for global / tenant configurable chargeback threshold policies
CREATE TABLE IF NOT EXISTS public.chargeback_threshold_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  min_transaction_count INT NOT NULL DEFAULT 100,
  observation_window_days INT NOT NULL DEFAULT 30,
  warning_rate_bps INT NOT NULL DEFAULT 65, -- 0.65%
  extra_reserve_rate_bps INT NOT NULL DEFAULT 100, -- 1.00%
  suspension_rate_bps INT NOT NULL DEFAULT 150, -- 1.50%
  extra_reserve_percentage NUMERIC(5,2) NOT NULL DEFAULT 10.00, -- 10%
  chargeback_fee_usd NUMERIC(18,4) NOT NULL DEFAULT 25.0000, -- $25.0000
  return_platform_fee_on_refund BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_chargeback_threshold_policies_tenant UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_chargeback_policies_tenant ON public.chargeback_threshold_policies (tenant_id);

ALTER TABLE public.chargeback_threshold_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chargeback_threshold_policies FORCE ROW LEVEL SECURITY;

CREATE POLICY chargeback_threshold_policies_tenant_isolation ON public.chargeback_threshold_policies
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 2. Table for sub-merchant chargeback metrics and graduated enforcement state
CREATE TABLE IF NOT EXISTS public.merchant_chargeback_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  observation_window_start TIMESTAMPTZ NOT NULL,
  observation_window_end TIMESTAMPTZ NOT NULL,
  total_transactions INT NOT NULL DEFAULT 0,
  total_chargebacks INT NOT NULL DEFAULT 0,
  chargeback_rate_bps INT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'normal'
    CHECK (status IN ('normal', 'warning', 'extra_reserve', 'suspended')),
  extra_reserve_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  last_evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_merchant_chargeback_metrics_company UNIQUE (company_id)
);

CREATE INDEX IF NOT EXISTS idx_merchant_chargeback_metrics_tenant ON public.merchant_chargeback_metrics (tenant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_chargeback_metrics_company ON public.merchant_chargeback_metrics (company_id);
CREATE INDEX IF NOT EXISTS idx_merchant_chargeback_metrics_status ON public.merchant_chargeback_metrics (status);

ALTER TABLE public.merchant_chargeback_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_chargeback_metrics FORCE ROW LEVEL SECURITY;

CREATE POLICY merchant_chargeback_metrics_tenant_isolation ON public.merchant_chargeback_metrics
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
