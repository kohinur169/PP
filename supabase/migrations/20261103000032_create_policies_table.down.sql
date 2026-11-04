-- path: supabase/migrations/20261103000032_create_policies_table.down.sql

DROP POLICY IF EXISTS pol_policies_isolation ON public.policies;
DROP TABLE IF EXISTS public.policies CASCADE;
