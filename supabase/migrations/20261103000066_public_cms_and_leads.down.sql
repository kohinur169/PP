-- path: supabase/migrations/20261103000066_public_cms_and_leads.down.sql

DROP POLICY IF EXISTS lead_contact_submissions_tenant_isolation ON public.lead_contact_submissions;
DROP TABLE IF EXISTS public.lead_contact_submissions CASCADE;

DROP POLICY IF EXISTS public_cms_pages_tenant_isolation ON public.public_cms_pages;
DROP TABLE IF EXISTS public.public_cms_pages CASCADE;
