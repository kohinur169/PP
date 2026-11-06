-- path: supabase/migrations/20261103000093_risk_policy_proposals.sql

-- Table for tracking versioned, effective-dated risk policy proposals and dual approvals
CREATE TABLE IF NOT EXISTS public.risk_policy_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  proposer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  approver_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('draft', 'proposed', 'approved', 'rejected', 'effective')),
  policy_type VARCHAR(64) NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  effective_date TIMESTAMPTZ NOT NULL,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_proposals_tenant ON public.risk_policy_proposals (tenant_id);
CREATE INDEX IF NOT EXISTS idx_risk_proposals_proposer ON public.risk_policy_proposals (proposer_id);
CREATE INDEX IF NOT EXISTS idx_risk_proposals_status ON public.risk_policy_proposals (status);
CREATE INDEX IF NOT EXISTS idx_risk_proposals_effective ON public.risk_policy_proposals (effective_date);

ALTER TABLE public.risk_policy_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_policy_proposals FORCE ROW LEVEL SECURITY;

CREATE POLICY risk_policy_proposals_tenant_isolation ON public.risk_policy_proposals
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
