-- path: db/migrations/023_create_compliance_calendar.down.sql

DROP POLICY IF EXISTS pol_compliance_calendar_isolation ON public.compliance_calendar_events;
DROP TABLE IF EXISTS public.compliance_calendar_events CASCADE;
