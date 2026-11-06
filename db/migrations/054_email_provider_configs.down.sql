-- path: db/migrations/054_email_provider_configs.down.sql

DROP POLICY IF EXISTS email_provider_configs_tenant_isolation ON public.email_provider_configs;
DROP TABLE IF EXISTS public.email_provider_configs CASCADE;
