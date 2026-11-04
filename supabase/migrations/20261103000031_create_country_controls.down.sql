-- path: supabase/migrations/20261103000031_create_country_controls.down.sql

DROP POLICY IF EXISTS pol_country_controls_isolation ON public.country_controls;
DROP TABLE IF EXISTS public.country_controls CASCADE;
