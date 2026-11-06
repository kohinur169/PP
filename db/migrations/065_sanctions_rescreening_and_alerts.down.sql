-- path: db/migrations/065_sanctions_rescreening_and_alerts.down.sql

DROP POLICY IF EXISTS compliance_alerts_tenant_isolation ON public.compliance_alerts;
DROP TABLE IF EXISTS public.compliance_alerts CASCADE;

DROP POLICY IF EXISTS sanctions_rescreening_runs_tenant_isolation ON public.sanctions_rescreening_runs;
DROP TABLE IF EXISTS public.sanctions_rescreening_runs CASCADE;
