-- path: supabase/migrations/20261103000003_auth_hooks_and_profile_sync.down.sql
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_auth_user();
