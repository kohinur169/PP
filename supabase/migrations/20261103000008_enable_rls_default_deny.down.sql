-- path: supabase/migrations/20261103000008_enable_rls_default_deny.down.sql
DROP FUNCTION IF EXISTS public.enable_and_force_rls(regclass);
