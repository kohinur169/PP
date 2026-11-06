-- path: supabase/migrations/20261103000055_dispute_evidence_packs.down.sql

DROP POLICY IF EXISTS dispute_evidence_packs_tenant_isolation ON public.dispute_evidence_packs;
DROP TABLE IF EXISTS public.dispute_evidence_packs CASCADE;
