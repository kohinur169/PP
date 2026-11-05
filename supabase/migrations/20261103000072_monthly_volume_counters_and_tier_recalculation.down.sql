-- path: supabase/migrations/20261103000072_monthly_volume_counters_and_tier_recalculation.down.sql

DROP POLICY IF EXISTS tier_recalculation_logs_tenant_isolation ON public.tier_recalculation_logs;
DROP TABLE IF EXISTS public.tier_recalculation_logs CASCADE;

DROP POLICY IF EXISTS merchant_monthly_volume_counters_tenant_isolation ON public.merchant_monthly_volume_counters;
DROP TABLE IF EXISTS public.merchant_monthly_volume_counters CASCADE;
