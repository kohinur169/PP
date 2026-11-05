-- path: supabase/migrations/20261103000043_submerchant_accounts.down.sql

DROP POLICY IF EXISTS submerchant_accounts_tenant_isolation ON public.submerchant_accounts;
DROP TABLE IF EXISTS public.submerchant_accounts CASCADE;
