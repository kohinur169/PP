-- path: supabase/migrations/20261103000065_platform_status_and_incidents.down.sql

DROP POLICY IF EXISTS platform_incidents_tenant_isolation ON public.platform_incidents;
DROP TABLE IF EXISTS public.platform_incidents CASCADE;

DROP POLICY IF EXISTS platform_service_states_tenant_isolation ON public.platform_service_states;
DROP TABLE IF EXISTS public.platform_service_states CASCADE;
