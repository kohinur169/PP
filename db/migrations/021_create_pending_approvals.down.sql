-- path: db/migrations/021_create_pending_approvals.down.sql

-- ==============================================================================
-- KD SOLUTION IT: Rollback Four-Eye Dual-Control Review Framework
-- Step 063: Dual-Control & Four-Eye Review Framework
-- Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains
-- ==============================================================================

DROP POLICY IF EXISTS pol_pending_approvals_isolation ON public.pending_approvals;
DROP TABLE IF EXISTS public.pending_approvals CASCADE;
