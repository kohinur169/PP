-- path: supabase/migrations/20261103000093_risk_policy_proposals.down.sql

DROP POLICY IF EXISTS risk_policy_proposals_tenant_isolation ON public.risk_policy_proposals;
DROP TABLE IF EXISTS public.risk_policy_proposals CASCADE;
