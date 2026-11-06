-- path: supabase/migrations/20261103000048_processor_fee_schedules.sql

CREATE TABLE IF NOT EXISTS public.processor_fee_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL
    CHECK (provider IN ('nmi', 'stripe_connect', 'rainforest', 'airwallex', 'payoneer')),
  payment_method VARCHAR(32) NOT NULL DEFAULT 'card'
    CHECK (payment_method IN ('card', 'ach', 'wallet', 'payout')),
  card_brand VARCHAR(32),
  percentage_rate NUMERIC(10, 6) NOT NULL DEFAULT 0.029000,
  fixed_fee_usd NUMERIC(18, 4) NOT NULL DEFAULT 0.3000,
  international_surcharge_rate NUMERIC(10, 6) NOT NULL DEFAULT 0.010000,
  amex_surcharge_rate NUMERIC(10, 6) NOT NULL DEFAULT 0.005000,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processor_fees_tenant ON public.processor_fee_schedules (tenant_id);
CREATE INDEX IF NOT EXISTS idx_processor_fees_provider ON public.processor_fee_schedules (provider);

ALTER TABLE public.processor_fee_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processor_fee_schedules FORCE ROW LEVEL SECURITY;

CREATE POLICY processor_fee_schedules_tenant_isolation ON public.processor_fee_schedules
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
