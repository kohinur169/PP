-- path: supabase/migrations/20261103000012_create_company_members_table.sql

-- ==============================================================================
-- KD SOLUTION IT: Company Memberships & Multi-Tenant Linkage Schema
-- Step 023: Company Memberships & Multi-Tenant Linkage Schema
-- Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines
-- ==============================================================================

-- 1. Create company_members join table with foreign keys and base columns
CREATE TABLE IF NOT EXISTS public.company_members (
  id uuid PRIMARY KEY DEFAULT generate_uuid_v7(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role varchar(50) NOT NULL,
  status varchar(50) NOT NULL DEFAULT 'active',
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  invited_at timestamptz NULL,
  accepted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz NULL,
  version int NOT NULL DEFAULT 1,
  CONSTRAINT chk_company_members_status CHECK (status IN ('active', 'invited', 'revoked')),
  CONSTRAINT chk_company_members_role CHECK (role IN (
    'owner', 'super_admin', 'ceo', 'compliance_kyc', 'finance_ops',
    'support', 'blogger', 'admin', 'developer', 'merchant_viewer'
  ))
);

-- 2. Unique membership per (company_id, user_id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_members_company_user
  ON public.company_members(company_id, user_id)
  WHERE deleted_at IS NULL;

-- 3. Business Rule: Exactly ONE owner permitted per company
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_members_one_owner_per_company
  ON public.company_members(company_id)
  WHERE role = 'owner' AND deleted_at IS NULL;

-- 4. B-Tree Performance Indexes
CREATE INDEX IF NOT EXISTS idx_company_members_user_id ON public.company_members(user_id);
CREATE INDEX IF NOT EXISTS idx_company_members_company_id ON public.company_members(company_id);
CREATE INDEX IF NOT EXISTS idx_company_members_role ON public.company_members(role);
CREATE INDEX IF NOT EXISTS idx_company_members_status ON public.company_members(status);

-- 5. Attach Automated updated_at and Version Triggers
SELECT attach_standard_table_triggers('public.company_members'::regclass);

-- 6. Enable and Force Row Level Security (RLS)
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members FORCE ROW LEVEL SECURITY;

-- 7. Define Membership Tenant & User Isolation RLS Policy
DROP POLICY IF EXISTS pol_company_members_tenant_isolation ON public.company_members;
CREATE POLICY pol_company_members_tenant_isolation ON public.company_members
FOR ALL TO PUBLIC
USING (
  is_current_superadmin()
  OR
  company_id = get_current_company_id()
  OR
  user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
)
WITH CHECK (
  is_current_superadmin()
  OR
  company_id = get_current_company_id()
  OR
  user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
);

COMMENT ON TABLE public.company_members IS 'Sub-merchant company staff assignments, roles, granular permission lists, and multi-tenant linkage';
