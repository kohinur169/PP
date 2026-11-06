-- path: supabase/migrations/20261103000078_cross_border_fee_breakdowns.down.sql

DROP POLICY IF EXISTS transaction_fee_breakdowns_tenant_isolation ON public.transaction_fee_breakdowns;
DROP TABLE IF EXISTS public.transaction_fee_breakdowns CASCADE;
