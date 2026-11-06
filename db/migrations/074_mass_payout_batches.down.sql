-- path: db/migrations/074_mass_payout_batches.down.sql

DROP POLICY IF EXISTS mass_payout_items_tenant_isolation ON public.mass_payout_items;
DROP TABLE IF EXISTS public.mass_payout_items CASCADE;

DROP POLICY IF EXISTS mass_payout_batches_tenant_isolation ON public.mass_payout_batches;
DROP TABLE IF EXISTS public.mass_payout_batches CASCADE;
