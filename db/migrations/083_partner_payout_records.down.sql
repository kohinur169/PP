-- path: db/migrations/083_partner_payout_records.down.sql

DROP POLICY IF EXISTS partner_payout_records_tenant_isolation ON public.partner_payout_records;
DROP TABLE IF EXISTS public.partner_payout_records CASCADE;
