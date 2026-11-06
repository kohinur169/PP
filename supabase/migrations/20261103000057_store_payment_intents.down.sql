-- path: supabase/migrations/20261103000057_store_payment_intents.down.sql

DROP POLICY IF EXISTS store_payment_intents_tenant_isolation ON public.store_payment_intents;
DROP TABLE IF EXISTS public.store_payment_intents CASCADE;
