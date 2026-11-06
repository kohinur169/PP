-- path: db/migrations/063_recurring_billing_and_subscriptions.sql

-- 1. Table for recurring invoice templates and auto-billing schedules
CREATE TABLE IF NOT EXISTS public.recurring_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_email VARCHAR(255) NOT NULL,
  amount_usd NUMERIC(18,4) NOT NULL,
  cadence VARCHAR(32) NOT NULL
    CHECK (cadence IN ('weekly', 'monthly', 'quarterly', 'annually')),
  next_run_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_invoices_tenant ON public.recurring_invoices (tenant_id);
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_due ON public.recurring_invoices (is_active, next_run_date);

ALTER TABLE public.recurring_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_invoices FORCE ROW LEVEL SECURITY;

CREATE POLICY recurring_invoices_tenant_isolation ON public.recurring_invoices
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 2. Table for merchant platform subscriptions and 7-day advance warnings
CREATE TABLE IF NOT EXISTS public.merchant_platform_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_name VARCHAR(64) NOT NULL,
  amount_usd NUMERIC(18,4) NOT NULL,
  next_charge_date DATE NOT NULL,
  advance_warning_sent_at DATE,
  status VARCHAR(32) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'past_due', 'canceled')),
  gateway_customer_vault_id VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON public.merchant_platform_subscriptions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_charge ON public.merchant_platform_subscriptions (status, next_charge_date);

ALTER TABLE public.merchant_platform_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_platform_subscriptions FORCE ROW LEVEL SECURITY;

CREATE POLICY merchant_platform_subscriptions_tenant_isolation ON public.merchant_platform_subscriptions
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
