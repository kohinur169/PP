-- path: supabase/migrations/20261103000026_create_approval_chains.down.sql

-- ==============================================================================
-- KD SOLUTION IT: Rollback Office Multi-Level Approval Chain Engine
-- Step 064: Office Multi-Level Approval Chain Engine (Requester -> CEO -> Super Admin)
-- Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains
-- ==============================================================================

DROP POLICY IF EXISTS pol_approval_chains_isolation ON public.approval_chains;
DROP TABLE IF EXISTS public.approval_chains CASCADE;
