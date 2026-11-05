-- path: supabase/migrations/20261103000063_announcements_and_dismissals.down.sql

DROP POLICY IF EXISTS announcement_dismissals_tenant_isolation ON public.announcement_dismissals;
DROP TABLE IF EXISTS public.announcement_dismissals CASCADE;

DROP POLICY IF EXISTS announcements_tenant_isolation ON public.announcements;
DROP TABLE IF EXISTS public.announcements CASCADE;
