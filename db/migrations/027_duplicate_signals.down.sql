-- path: db/migrations/027_duplicate_signals.down.sql

DROP POLICY IF EXISTS duplicate_signals_tenant_isolation ON public.duplicate_signals;
DROP TABLE IF EXISTS public.duplicate_signals CASCADE;
