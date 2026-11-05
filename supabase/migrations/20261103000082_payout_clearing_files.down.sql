-- path: supabase/migrations/20261103000082_payout_clearing_files.down.sql

DROP POLICY IF EXISTS payout_clearing_files_tenant_isolation ON public.payout_clearing_files;
DROP TABLE IF EXISTS public.payout_clearing_files CASCADE;
