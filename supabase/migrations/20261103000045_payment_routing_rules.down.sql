-- path: supabase/migrations/20261103000045_payment_routing_rules.down.sql

DROP POLICY IF EXISTS payment_routing_rules_tenant_isolation ON public.payment_routing_rules;
DROP TABLE IF EXISTS public.payment_routing_rules CASCADE;
