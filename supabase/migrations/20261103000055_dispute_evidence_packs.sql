-- path: supabase/migrations/20261103000055_dispute_evidence_packs.sql

CREATE TABLE IF NOT EXISTS public.dispute_evidence_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  dispute_id UUID NOT NULL REFERENCES public.payment_disputes(id) ON DELETE CASCADE,
  rebuttal_summary TEXT NOT NULL,
  invoice_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  delivery_proof JSONB NOT NULL DEFAULT '{}'::jsonb,
  communication_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  terms_acceptance JSONB NOT NULL DEFAULT '{}'::jsonb,
  additional_documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('draft', 'submitted', 'under_review', 'approved_and_dispatched', 'rejected_by_compliance')),
  submitted_by UUID NOT NULL REFERENCES public.users(id),
  reviewed_by UUID REFERENCES public.users(id),
  reviewed_at TIMESTAMPTZ,
  compliance_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_packs_tenant ON public.dispute_evidence_packs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_evidence_packs_company ON public.dispute_evidence_packs (company_id);
CREATE INDEX IF NOT EXISTS idx_evidence_packs_dispute ON public.dispute_evidence_packs (dispute_id);
CREATE INDEX IF NOT EXISTS idx_evidence_packs_status ON public.dispute_evidence_packs (status);

ALTER TABLE public.dispute_evidence_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_evidence_packs FORCE ROW LEVEL SECURITY;

CREATE POLICY dispute_evidence_packs_tenant_isolation ON public.dispute_evidence_packs
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
