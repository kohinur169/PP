-- path: db/migrations/021_create_terms_acceptances.down.sql

DROP POLICY IF EXISTS pol_terms_acceptances_isolation ON public.terms_acceptances;
DROP TABLE IF EXISTS public.terms_acceptances CASCADE;
