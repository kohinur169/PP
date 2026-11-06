-- path: supabase/migrations/20261103000051_pre_capture_reviews.sql

CREATE TABLE IF NOT EXISTS public.pre_capture_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL,
  amount NUMERIC(18,4) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  status VARCHAR(32) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  provider VARCHAR(64) NOT NULL,
  reviewer_id UUID REFERENCES public.users(id),
  reviewer_role VARCHAR(64),
  justification TEXT,
  rejection_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pre_capture_reviews_tenant ON public.pre_capture_reviews (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pre_capture_reviews_company ON public.pre_capture_reviews (company_id);
CREATE INDEX IF NOT EXISTS idx_pre_capture_reviews_payment ON public.pre_capture_reviews (payment_id);
CREATE INDEX IF NOT EXISTS idx_pre_capture_reviews_status ON public.pre_capture_reviews (status);

ALTER TABLE public.pre_capture_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_capture_reviews FORCE ROW LEVEL SECURITY;

CREATE POLICY pre_capture_reviews_tenant_isolation ON public.pre_capture_reviews
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
