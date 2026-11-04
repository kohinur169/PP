-- path: supabase/migrations/20261103000026_create_approval_chains.sql

-- ==============================================================================
-- KD SOLUTION IT: Office Multi-Level Approval Chain Engine
-- Step 064: Office Multi-Level Approval Chain Engine (Requester -> CEO -> Super Admin)
-- Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains
-- ==============================================================================

-- 1. Create approval_chains table
CREATE TABLE IF NOT EXISTS public.approval_chains (
  id uuid PRIMARY KEY DEFAULT generate_uuid_v7(),
  chain_id uuid NOT NULL,
  company_id uuid NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  proposal_id uuid NULL REFERENCES public.pending_approvals(id) ON DELETE CASCADE,
  action_type varchar(100) NOT NULL,
  step_order int NOT NULL,
  required_role varchar(50) NOT NULL,
  actor_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  status varchar(50) NOT NULL DEFAULT 'pending',
  decision_notes text NULL,
  action_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  decided_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz NULL,
  version int NOT NULL DEFAULT 1,
  CONSTRAINT chk_approval_chains_status CHECK (status IN ('pending', 'awaiting_action', 'approved', 'rejected', 'skipped', 'cancelled'))
);

-- 2. Performance & Workflow Indexes
CREATE INDEX IF NOT EXISTS idx_approval_chains_chain_id ON public.approval_chains(chain_id);
CREATE INDEX IF NOT EXISTS idx_approval_chains_proposal_id ON public.approval_chains(proposal_id);
CREATE INDEX IF NOT EXISTS idx_approval_chains_status ON public.approval_chains(status);
CREATE INDEX IF NOT EXISTS idx_approval_chains_required_role ON public.approval_chains(required_role);
CREATE INDEX IF NOT EXISTS idx_approval_chains_order ON public.approval_chains(chain_id, step_order);

-- 3. Attach standard updated_at and version triggers
SELECT attach_standard_table_triggers('public.approval_chains'::regclass);

-- 4. Enable and Force Row Level Security (RLS)
ALTER TABLE public.approval_chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_chains FORCE ROW LEVEL SECURITY;

-- 5. RLS Security Policy
DROP POLICY IF EXISTS pol_approval_chains_isolation ON public.approval_chains;
CREATE POLICY pol_approval_chains_isolation ON public.approval_chains
FOR ALL TO PUBLIC
USING (
  is_current_superadmin()
  OR
  actor_id::text = current_setting('app.current_user_id', true)
  OR
  (company_id IS NOT NULL AND company_id::text = current_setting('app.current_company_id', true))
)
WITH CHECK (
  is_current_superadmin()
  OR
  actor_id::text = current_setting('app.current_user_id', true)
  OR
  (company_id IS NOT NULL AND company_id::text = current_setting('app.current_company_id', true))
);
