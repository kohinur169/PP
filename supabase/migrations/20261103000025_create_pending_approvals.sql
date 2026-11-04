-- path: supabase/migrations/20261103000025_create_pending_approvals.sql

-- ==============================================================================
-- KD SOLUTION IT: Four-Eye Dual-Control Review Framework
-- Step 063: Dual-Control & Four-Eye Review Framework
-- Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains
-- ==============================================================================

-- 1. Create pending_approvals table
CREATE TABLE IF NOT EXISTS public.pending_approvals (
  id uuid PRIMARY KEY DEFAULT generate_uuid_v7(),
  company_id uuid NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  action_type varchar(100) NOT NULL,
  target_id varchar(100) NULL,
  current_state jsonb NULL DEFAULT '{}'::jsonb,
  proposed_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  diff_summary jsonb NULL DEFAULT '{}'::jsonb,
  initiator_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  initiator_role varchar(50) NOT NULL,
  initiator_notes text NULL,
  approver_id uuid NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  approver_role varchar(50) NULL,
  approval_notes text NULL,
  rejection_reason text NULL,
  status varchar(50) NOT NULL DEFAULT 'pending',
  approved_at timestamptz NULL,
  rejected_at timestamptz NULL,
  executed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz NULL,
  version int NOT NULL DEFAULT 1,
  CONSTRAINT chk_pending_approvals_status CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  CONSTRAINT chk_initiator_differs_from_approver CHECK (approver_id IS NULL OR initiator_id <> approver_id)
);

-- 2. Performance & Audit Indexes
CREATE INDEX IF NOT EXISTS idx_pending_approvals_status ON public.pending_approvals(status);
CREATE INDEX IF NOT EXISTS idx_pending_approvals_action_type ON public.pending_approvals(action_type);
CREATE INDEX IF NOT EXISTS idx_pending_approvals_initiator_id ON public.pending_approvals(initiator_id);
CREATE INDEX IF NOT EXISTS idx_pending_approvals_approver_id ON public.pending_approvals(approver_id);
CREATE INDEX IF NOT EXISTS idx_pending_approvals_company_id ON public.pending_approvals(company_id);

-- 3. Attach standard updated_at and version triggers
SELECT attach_standard_table_triggers('public.pending_approvals'::regclass);

-- 4. Enable and Force Row Level Security (RLS)
ALTER TABLE public.pending_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_approvals FORCE ROW LEVEL SECURITY;

-- 5. RLS Security Policy
DROP POLICY IF EXISTS pol_pending_approvals_isolation ON public.pending_approvals;
CREATE POLICY pol_pending_approvals_isolation ON public.pending_approvals
FOR ALL TO PUBLIC
USING (
  is_current_superadmin()
  OR
  initiator_id::text = current_setting('app.current_user_id', true)
  OR
  approver_id::text = current_setting('app.current_user_id', true)
  OR
  (company_id IS NOT NULL AND company_id::text = current_setting('app.current_company_id', true))
)
WITH CHECK (
  is_current_superadmin()
  OR
  initiator_id::text = current_setting('app.current_user_id', true)
  OR
  approver_id::text = current_setting('app.current_user_id', true)
  OR
  (company_id IS NOT NULL AND company_id::text = current_setting('app.current_company_id', true))
);
