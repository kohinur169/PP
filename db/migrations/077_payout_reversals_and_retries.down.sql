-- path: db/migrations/077_payout_reversals_and_retries.down.sql

DROP POLICY IF EXISTS payout_return_events_tenant_isolation ON public.payout_return_events;
DROP TABLE IF EXISTS public.payout_return_events CASCADE;
