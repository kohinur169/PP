-- path: supabase/migrations/20261103000002_create_tenants_and_rls.down.sql
DROP TABLE IF EXISTS public.tenant_memberships CASCADE;
DROP TABLE IF EXISTS public.tenant_settings CASCADE;
DROP TABLE IF EXISTS public.tenants CASCADE;
