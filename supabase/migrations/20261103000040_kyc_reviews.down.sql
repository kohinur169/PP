-- path: supabase/migrations/20261103000040_kyc_reviews.down.sql

DROP POLICY IF EXISTS kyc_reviews_tenant_isolation ON public.kyc_reviews;
DROP TABLE IF EXISTS public.kyc_reviews CASCADE;
