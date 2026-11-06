-- path: supabase/migrations/20261103000070_settlement_batches_and_fulfilment_gates.down.sql

DROP POLICY IF EXISTS merchant_settlement_batches_tenant_isolation ON public.merchant_settlement_batches;
DROP TABLE IF EXISTS public.merchant_settlement_batches CASCADE;
