-- path: db/migrations/030_idv_settings.down.sql

DROP POLICY IF EXISTS idv_settings_tenant_isolation ON public.idv_settings;
DROP TABLE IF EXISTS public.idv_settings CASCADE;
