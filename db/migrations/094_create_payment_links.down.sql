-- path: db/migrations/094_create_payment_links.down.sql

DROP POLICY IF EXISTS payment_links_tenant_isolation ON public.payment_links;
DROP TABLE IF EXISTS public.payment_links CASCADE;
