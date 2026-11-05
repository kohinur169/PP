-- path: supabase/migrations/20261103000077_dcc_quotes.down.sql

DROP POLICY IF EXISTS dcc_quotes_tenant_isolation ON public.dcc_quotes;
DROP TABLE IF EXISTS public.dcc_quotes CASCADE;
