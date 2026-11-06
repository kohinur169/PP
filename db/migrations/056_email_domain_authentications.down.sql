-- path: db/migrations/056_email_domain_authentications.down.sql

DROP POLICY IF EXISTS email_domain_authentications_tenant_isolation ON public.email_domain_authentications;
DROP TABLE IF EXISTS public.email_domain_authentications CASCADE;
