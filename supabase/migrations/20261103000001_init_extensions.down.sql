-- path: supabase/migrations/20261103000001_init_extensions.down.sql
DROP FUNCTION IF EXISTS public.update_updated_at_column();
DROP FUNCTION IF EXISTS public.generate_uuid_v7();
DROP TABLE IF EXISTS public._schema_migrations CASCADE;
