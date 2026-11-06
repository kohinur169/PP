-- path: supabase/migrations/20261103000087_partner_programs_and_attributions.sql

-- 1. Table for partners (ISOs, Referral, Integration) with W-9/W-8BEN tax verification
CREATE TABLE IF NOT EXISTS public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  partner_name VARCHAR(255) NOT NULL,
  partner_type VARCHAR(32) NOT NULL
    CHECK (partner_type IN ('referral', 'iso', 'integration')),
  status VARCHAR(32) NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'active', 'suspended', 'terminated')),
  referral_code VARCHAR(64) NOT NULL UNIQUE,
  agreement_accepted_at TIMESTAMPTZ,
  agreement_version VARCHAR(32),
  tax_form_type VARCHAR(16)
    CHECK (tax_form_type IN ('w9', 'w8ben', 'w8ben_e')),
  tax_form_status VARCHAR(32) NOT NULL DEFAULT 'pending'
    CHECK (tax_form_status IN ('pending', 'verified', 'rejected')),
  tax_form_file_id UUID REFERENCES public.files(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partners_tenant ON public.partners (tenant_id);
CREATE INDEX IF NOT EXISTS idx_partners_type ON public.partners (partner_type);
CREATE INDEX IF NOT EXISTS idx_partners_code ON public.partners (referral_code);

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners FORCE ROW LEVEL SECURITY;

CREATE POLICY partners_tenant_isolation ON public.partners
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 2. Table for referral clicks and merchant registration attribution
CREATE TABLE IF NOT EXISTS public.partner_referral_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  referred_company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  attribution_token VARCHAR(64) NOT NULL UNIQUE,
  visitor_ip_hash VARCHAR(64) NOT NULL,
  landing_url TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'clicked'
    CHECK (status IN ('clicked', 'registered', 'converted', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_attr_tenant ON public.partner_referral_attributions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_referral_attr_partner ON public.partner_referral_attributions (partner_id);
CREATE INDEX IF NOT EXISTS idx_referral_attr_token ON public.partner_referral_attributions (attribution_token);

ALTER TABLE public.partner_referral_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_referral_attributions FORCE ROW LEVEL SECURITY;

CREATE POLICY partner_referral_attributions_tenant_isolation ON public.partner_referral_attributions
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
