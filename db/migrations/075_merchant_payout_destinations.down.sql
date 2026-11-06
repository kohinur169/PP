-- path: db/migrations/075_merchant_payout_destinations.down.sql

DROP POLICY IF EXISTS merchant_payout_destinations_tenant_isolation ON public.merchant_payout_destinations;
DROP TABLE IF EXISTS public.merchant_payout_destinations CASCADE;
