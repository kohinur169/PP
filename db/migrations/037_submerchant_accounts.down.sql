-- path: db/migrations/037_submerchant_accounts.down.sql

DROP POLICY IF EXISTS submerchant_accounts_tenant_isolation ON public.submerchant_accounts;
DROP TABLE IF EXISTS public.submerchant_accounts CASCADE;
