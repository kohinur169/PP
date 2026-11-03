-- path: supabase/migrations/20261103000007_base_columns_and_triggers.down.sql
DROP FUNCTION IF EXISTS public.attach_standard_table_triggers(regclass);
DROP FUNCTION IF EXISTS public.handle_soft_delete();
DROP FUNCTION IF EXISTS public.enforce_optimistic_lock();
DROP FUNCTION IF EXISTS public.set_standard_timestamps();
