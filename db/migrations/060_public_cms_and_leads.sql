-- path: db/migrations/060_public_cms_and_leads.sql

-- 1. Table for public CMS pages editable by blogger / super_admin
CREATE TABLE IF NOT EXISTS public.public_cms_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  page_slug VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  headline VARCHAR(255) NOT NULL,
  body_markdown TEXT NOT NULL,
  seo_title VARCHAR(255) NOT NULL,
  meta_description TEXT NOT NULL,
  canonical_url VARCHAR(255),
  is_published BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_cms_pages_tenant_slug UNIQUE (tenant_id, page_slug)
);

CREATE INDEX IF NOT EXISTS idx_cms_pages_tenant ON public.public_cms_pages (tenant_id);

ALTER TABLE public.public_cms_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_cms_pages FORCE ROW LEVEL SECURITY;

CREATE POLICY public_cms_pages_tenant_isolation ON public.public_cms_pages
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 2. Table for lead & contact form submissions with Turnstile verification
CREATE TABLE IF NOT EXISTS public.lead_contact_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  full_name VARCHAR(128) NOT NULL,
  email VARCHAR(255) NOT NULL,
  company_name VARCHAR(255),
  message TEXT NOT NULL,
  turnstile_verified BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(32) NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'qualified', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_tenant ON public.lead_contact_submissions (tenant_id);

ALTER TABLE public.lead_contact_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_contact_submissions FORCE ROW LEVEL SECURITY;

CREATE POLICY lead_contact_submissions_tenant_isolation ON public.lead_contact_submissions
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
