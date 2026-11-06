-- path: supabase/migrations/20261103000050_card_blacklist.down.sql

DROP POLICY IF EXISTS card_blacklist_tenant_isolation ON public.card_blacklist;
DROP TABLE IF EXISTS public.card_blacklist CASCADE;
