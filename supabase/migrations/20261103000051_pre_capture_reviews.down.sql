-- path: supabase/migrations/20261103000051_pre_capture_reviews.down.sql

DROP POLICY IF EXISTS pre_capture_reviews_tenant_isolation ON public.pre_capture_reviews;
DROP TABLE IF EXISTS public.pre_capture_reviews CASCADE;
