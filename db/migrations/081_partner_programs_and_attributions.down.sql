-- path: db/migrations/081_partner_programs_and_attributions.down.sql

DROP POLICY IF EXISTS partner_referral_attributions_tenant_isolation ON public.partner_referral_attributions;
DROP TABLE IF EXISTS public.partner_referral_attributions CASCADE;

DROP POLICY IF EXISTS partners_tenant_isolation ON public.partners;
DROP TABLE IF EXISTS public.partners CASCADE;
