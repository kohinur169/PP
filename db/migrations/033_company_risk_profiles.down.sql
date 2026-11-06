-- path: db/migrations/033_company_risk_profiles.down.sql

DROP POLICY IF EXISTS company_risk_profiles_tenant_isolation ON public.company_risk_profiles;
DROP TABLE IF EXISTS public.company_risk_profiles CASCADE;
