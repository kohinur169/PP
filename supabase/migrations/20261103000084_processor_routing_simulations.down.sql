-- path: supabase/migrations/20261103000084_processor_routing_simulations.down.sql

DROP POLICY IF EXISTS processor_routing_simulations_tenant_isolation ON public.processor_routing_simulations;
DROP TABLE IF EXISTS public.processor_routing_simulations CASCADE;
