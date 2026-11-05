-- path: supabase/migrations/20261103000088_partner_commissions.sql

-- 1. Table for partner commission agreements (volume share, fee share, bounty, tiered structures)
CREATE TABLE IF NOT EXISTS public.partner_commission_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  model_type VARCHAR(32) NOT NULL
    CHECK (model_type IN ('volume_percentage', 'platform_fee_percentage', 'fixed_bounty')),
  rate_basis_points INT NOT NULL DEFAULT 0,
  fee_share_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  bounty_amount_usd NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  tiered_structure JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_agree_tenant ON public.partner_commission_agreements (tenant_id);
CREATE INDEX IF NOT EXISTS idx_partner_agree_partner ON public.partner_commission_agreements (partner_id);

ALTER TABLE public.partner_commission_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_commission_agreements FORCE ROW LEVEL SECURITY;

CREATE POLICY partner_commission_agreements_tenant_isolation ON public.partner_commission_agreements
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 2. Table for automated monthly partner commission calculations
CREATE TABLE IF NOT EXISTS public.partner_monthly_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  billing_cycle VARCHAR(7) NOT NULL,
  total_referred_volume_usd NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  total_platform_fee_usd NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  effective_tier VARCHAR(32) NOT NULL DEFAULT 'Tier 1',
  earned_commission_usd NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  status VARCHAR(32) NOT NULL DEFAULT 'accrued'
    CHECK (status IN ('accrued', 'tax_hold', 'paid', 'cancelled')),
  ledger_journal_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_partner_cycle UNIQUE (tenant_id, partner_id, billing_cycle)
);

CREATE INDEX IF NOT EXISTS idx_partner_comm_tenant ON public.partner_monthly_commissions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_partner_comm_partner ON public.partner_monthly_commissions (partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_comm_cycle ON public.partner_monthly_commissions (billing_cycle);

ALTER TABLE public.partner_monthly_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_monthly_commissions FORCE ROW LEVEL SECURITY;

CREATE POLICY partner_monthly_commissions_tenant_isolation ON public.partner_monthly_commissions
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
