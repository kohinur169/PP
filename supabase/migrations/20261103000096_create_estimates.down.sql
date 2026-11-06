-- path: supabase/migrations/20261103000096_create_estimates.down.sql

DROP POLICY IF EXISTS estimate_items_tenant_isolation ON public.estimate_items;
DROP TABLE IF EXISTS public.estimate_items CASCADE;
DROP POLICY IF EXISTS estimates_tenant_isolation ON public.estimates;
DROP TABLE IF EXISTS public.estimates CASCADE;
