-- path: supabase/migrations/20261103000006_uuidv7_generator.down.sql
DROP FUNCTION IF EXISTS public.generate_uuid_v7();
