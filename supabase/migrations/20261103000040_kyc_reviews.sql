-- path: supabase/migrations/20261103000040_kyc_reviews.sql

CREATE TABLE IF NOT EXISTS public.kyc_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  risk_level VARCHAR(16) NOT NULL DEFAULT 'standard'
    CHECK (risk_level IN ('standard', 'high_risk', 'elevated_volume')),
  requires_four_eyes BOOLEAN NOT NULL DEFAULT false,
  first_reviewer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  first_reviewed_at TIMESTAMPTZ,
  first_reviewer_decision VARCHAR(32)
    CHECK (first_reviewer_decision IS NULL OR first_reviewer_decision IN ('approved', 'rejected', 'info_requested')),
  first_reviewer_notes TEXT,
  second_reviewer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  second_reviewed_at TIMESTAMPTZ,
  second_reviewer_decision VARCHAR(32)
    CHECK (second_reviewer_decision IS NULL OR second_reviewer_decision IN ('approved', 'rejected', 'info_requested')),
  second_reviewer_notes TEXT,
  overall_status VARCHAR(32) NOT NULL DEFAULT 'pending_first_review'
    CHECK (overall_status IN ('pending_first_review', 'pending_second_review', 'ready_for_ceo_approval', 'rejected', 'info_requested')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_four_eyes_distinct_reviewers
    CHECK (second_reviewer_id IS NULL OR first_reviewer_id IS NULL OR first_reviewer_id <> second_reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_kyc_reviews_tenant ON public.kyc_reviews (tenant_id);
CREATE INDEX IF NOT EXISTS idx_kyc_reviews_company ON public.kyc_reviews (company_id);
CREATE INDEX IF NOT EXISTS idx_kyc_reviews_status ON public.kyc_reviews (overall_status);

ALTER TABLE public.kyc_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_reviews FORCE ROW LEVEL SECURITY;

CREATE POLICY kyc_reviews_tenant_isolation ON public.kyc_reviews
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
