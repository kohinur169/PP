-- path: db/migrations/022_compliance_officer_settings.down.sql

DROP POLICY IF EXISTS pol_compliance_officer_write ON public.compliance_officer_settings;
DROP POLICY IF EXISTS pol_compliance_officer_read ON public.compliance_officer_settings;
DROP TABLE IF EXISTS public.compliance_officer_settings CASCADE;
