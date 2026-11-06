-- path: supabase/migrations/20261103000052_chargeback_policies.down.sql

DROP POLICY IF EXISTS merchant_chargeback_metrics_tenant_isolation ON public.merchant_chargeback_metrics;
DROP TABLE IF EXISTS public.merchant_chargeback_metrics CASCADE;

DROP POLICY IF EXISTS chargeback_threshold_policies_tenant_isolation ON public.chargeback_threshold_policies;
DROP TABLE IF EXISTS public.chargeback_threshold_policies CASCADE;
