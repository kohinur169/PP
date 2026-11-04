-- path: supabase/migrations/20261103000032_create_policies_table.sql

-- ==============================================================================
-- KD SOLUTION IT: CMS Editable Legal Policy Architecture
-- Step 082: CMS Editable Legal Policy Architecture
-- Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine
-- ==============================================================================

-- 1. Create policies table
CREATE TABLE IF NOT EXISTS public.policies (
  id uuid PRIMARY KEY DEFAULT generate_uuid_v7(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  slug varchar(100) NOT NULL,
  title varchar(255) NOT NULL,
  category varchar(50) NOT NULL DEFAULT 'legal',
  content_md text NOT NULL,
  policy_version int NOT NULL DEFAULT 1,
  effective_date timestamptz NOT NULL DEFAULT clock_timestamp(),
  is_published boolean NOT NULL DEFAULT true,
  published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  change_summary text NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz NULL,
  version int NOT NULL DEFAULT 1,
  CONSTRAINT uq_policy_slug_version UNIQUE (slug, policy_version)
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_policies_slug ON public.policies(slug);
CREATE INDEX IF NOT EXISTS idx_policies_published ON public.policies(is_published, policy_version);
CREATE INDEX IF NOT EXISTS idx_policies_category ON public.policies(category);

-- 3. Attach standard triggers
SELECT attach_standard_table_triggers('public.policies'::regclass);

-- 4. Enable and Force Row Level Security (RLS)
ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policies FORCE ROW LEVEL SECURITY;

-- 5. RLS Security Policy: Public read for published active policies; Mutation restricted to Super Admin
DROP POLICY IF EXISTS pol_policies_isolation ON public.policies;
CREATE POLICY pol_policies_isolation ON public.policies
FOR ALL TO PUBLIC
USING (
  is_current_superadmin()
  OR
  current_setting('app.current_user_role', true) IN ('super_admin', 'ceo', 'compliance_kyc', 'blogger', 'support')
  OR
  (is_published = true AND deleted_at IS NULL)
)
WITH CHECK (
  is_current_superadmin()
  OR
  current_setting('app.current_user_role', true) = 'super_admin'
);
