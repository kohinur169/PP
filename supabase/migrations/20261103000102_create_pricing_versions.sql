-- path: supabase/migrations/20261103000102_create_pricing_versions.sql

-- Table for transparent pricing versions and 30-day advance revision notices
CREATE TABLE IF NOT EXISTS public.pricing_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version_number VARCHAR(32) NOT NULL,
  platform_fee_percent NUMERIC(5,4) NOT NULL DEFAULT 0.0290,
  platform_fee_fixed_usd NUMERIC(18,4) NOT NULL DEFAULT 0.3000,
  chargeback_fee_usd NUMERIC(18,4) NOT NULL DEFAULT 15.0000,
  refund_fee_usd NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
  payout_ach_fee_usd NUMERIC(18,4) NOT NULL DEFAULT 0.2500,
  payout_wire_fee_usd NUMERIC(18,4) NOT NULL DEFAULT 15.0000,
  is_active BOOLEAN NOT NULL DEFAULT false,
  super_admin_approved_by UUID REFERENCES public.users(id),
  ceo_approved_by UUID REFERENCES public.users(id),
  effective_date TIMESTAMPTZ NOT NULL,
  announcement_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_versions_tenant ON public.pricing_versions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pricing_versions_active ON public.pricing_versions (is_active);
CREATE INDEX IF NOT EXISTS idx_pricing_versions_effective ON public.pricing_versions (effective_date);

ALTER TABLE public.pricing_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_versions FORCE ROW LEVEL SECURITY;

CREATE POLICY pricing_versions_tenant_isolation ON public.pricing_versions
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
