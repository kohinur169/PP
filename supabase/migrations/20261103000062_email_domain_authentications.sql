-- path: supabase/migrations/20261103000062_email_domain_authentications.sql

CREATE TABLE IF NOT EXISTS public.email_domain_authentications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  domain_purpose VARCHAR(32) NOT NULL
    CHECK (domain_purpose IN ('transactional', 'marketing')),
  domain_name VARCHAR(255) NOT NULL,
  spf_record TEXT NOT NULL,
  spf_status VARCHAR(32) NOT NULL DEFAULT 'unverified'
    CHECK (spf_status IN ('unverified', 'valid', 'invalid')),
  dkim_selector VARCHAR(64) NOT NULL,
  dkim_record TEXT NOT NULL,
  dkim_status VARCHAR(32) NOT NULL DEFAULT 'unverified'
    CHECK (dkim_status IN ('unverified', 'valid', 'invalid')),
  dmarc_record TEXT NOT NULL,
  dmarc_status VARCHAR(32) NOT NULL DEFAULT 'unverified'
    CHECK (dmarc_status IN ('unverified', 'valid', 'invalid')),
  is_verified_for_launch BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_email_domains_tenant_purpose UNIQUE (tenant_id, domain_purpose)
);

CREATE INDEX IF NOT EXISTS idx_email_domain_auth_tenant ON public.email_domain_authentications (tenant_id);

ALTER TABLE public.email_domain_authentications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_domain_authentications FORCE ROW LEVEL SECURITY;

CREATE POLICY email_domain_authentications_tenant_isolation ON public.email_domain_authentications
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
