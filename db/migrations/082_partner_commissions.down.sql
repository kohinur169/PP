-- path: db/migrations/082_partner_commissions.down.sql

DROP POLICY IF EXISTS partner_monthly_commissions_tenant_isolation ON public.partner_monthly_commissions;
DROP TABLE IF EXISTS public.partner_monthly_commissions CASCADE;

DROP POLICY IF EXISTS partner_commission_agreements_tenant_isolation ON public.partner_commission_agreements;
DROP TABLE IF EXISTS public.partner_commission_agreements CASCADE;
