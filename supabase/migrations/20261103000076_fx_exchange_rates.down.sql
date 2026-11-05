-- path: supabase/migrations/20261103000076_fx_exchange_rates.down.sql

DROP POLICY IF EXISTS fx_exchange_rates_tenant_isolation ON public.fx_exchange_rates;
DROP TABLE IF EXISTS public.fx_exchange_rates CASCADE;
