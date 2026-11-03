-- path: supabase/migrations/20261103000009_tenant_session_functions.down.sql
DROP FUNCTION IF EXISTS public.is_current_superadmin();
DROP FUNCTION IF EXISTS public.get_current_user_role();
DROP FUNCTION IF EXISTS public.get_current_company_id();
DROP FUNCTION IF EXISTS public.get_current_user_id();
DROP FUNCTION IF EXISTS public.set_tenant_context(uuid, uuid, varchar, boolean);
