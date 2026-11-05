-- path: supabase/migrations/20261103000047_webhook_events.down.sql

DROP POLICY IF EXISTS webhook_events_tenant_isolation ON public.webhook_events;
DROP TABLE IF EXISTS public.webhook_events CASCADE;
