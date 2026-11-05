-- path: supabase/migrations/20261103000075_status_subscribers_and_health_pings.down.sql

DROP POLICY IF EXISTS synthetic_health_pings_tenant_isolation ON public.synthetic_health_pings;
DROP TABLE IF EXISTS public.synthetic_health_pings CASCADE;

DROP POLICY IF EXISTS status_page_subscribers_tenant_isolation ON public.status_page_subscribers;
DROP TABLE IF EXISTS public.status_page_subscribers CASCADE;
