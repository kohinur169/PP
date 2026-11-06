-- path: supabase/migrations/20261103000080_mass_payout_batches.sql

-- 1. Table for mass payout batches with dual-authorization approval for >= $50k
CREATE TABLE IF NOT EXISTS public.mass_payout_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  batch_reference VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(32) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'processing', 'completed', 'partial', 'failed', 'rejected')),
  total_payout_amount_usd NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  total_holdback_usd NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  item_count INT NOT NULL DEFAULT 0,
  requires_dual_approval BOOLEAN NOT NULL DEFAULT false,
  first_approved_by UUID REFERENCES public.users(id),
  first_approved_at TIMESTAMPTZ,
  second_approved_by UUID REFERENCES public.users(id),
  second_approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_batches_tenant ON public.mass_payout_batches (tenant_id);
CREATE INDEX IF NOT EXISTS idx_payout_batches_status ON public.mass_payout_batches (status);

ALTER TABLE public.mass_payout_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mass_payout_batches FORCE ROW LEVEL SECURITY;

CREATE POLICY mass_payout_batches_tenant_isolation ON public.mass_payout_batches
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 2. Table for individual payout items within a mass payout batch
CREATE TABLE IF NOT EXISTS public.mass_payout_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.mass_payout_batches(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  destination_type VARCHAR(32) NOT NULL
    CHECK (destination_type IN ('ach', 'wire', 'sepa', 'payoneer', 'card')),
  destination_details JSONB NOT NULL DEFAULT '{}',
  gross_balance_usd NUMERIC(18, 4) NOT NULL,
  dispute_reserve_holdback_usd NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  net_payout_usd NUMERIC(18, 4) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'rejected')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_items_tenant ON public.mass_payout_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_payout_items_batch ON public.mass_payout_items (batch_id);
CREATE INDEX IF NOT EXISTS idx_payout_items_company ON public.mass_payout_items (company_id);

ALTER TABLE public.mass_payout_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mass_payout_items FORCE ROW LEVEL SECURITY;

CREATE POLICY mass_payout_items_tenant_isolation ON public.mass_payout_items
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
