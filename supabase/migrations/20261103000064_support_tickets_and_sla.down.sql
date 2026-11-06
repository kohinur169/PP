-- path: supabase/migrations/20261103000064_support_tickets_and_sla.down.sql

DROP POLICY IF EXISTS support_ticket_messages_tenant_isolation ON public.support_ticket_messages;
DROP TABLE IF EXISTS public.support_ticket_messages CASCADE;

DROP POLICY IF EXISTS support_tickets_tenant_isolation ON public.support_tickets;
DROP TABLE IF EXISTS public.support_tickets CASCADE;
