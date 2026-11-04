-- path: db/migrations/025_create_country_controls.sql

-- ==============================================================================
-- KD SOLUTION IT: Global Country Enable/Disable Engine with Sanctioned Country Freeze
-- Step 081: Global Country Enable/Disable Engine with Sanctioned Country Freeze
-- Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine
-- ==============================================================================

-- 1. Create country_controls table
CREATE TABLE IF NOT EXISTS public.country_controls (
  id uuid PRIMARY KEY DEFAULT generate_uuid_v7(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  country_code varchar(2) NOT NULL UNIQUE,
  country_name varchar(100) NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  is_sanctioned_frozen boolean NOT NULL DEFAULT false,
  sanctions_program varchar(100) NULL,
  pending_change_status varchar(32) NULL,
  proposed_enabled boolean NULL,
  proposed_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  approved_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  change_justification text NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz NULL,
  version int NOT NULL DEFAULT 1,
  -- Hardcode permanent sanctions freeze in database check constraint
  CONSTRAINT chk_sanctioned_country_permanent_freeze CHECK (NOT (is_sanctioned_frozen = true AND is_enabled = true)),
  CONSTRAINT chk_sanctioned_country_proposed_freeze CHECK (NOT (is_sanctioned_frozen = true AND proposed_enabled = true))
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_country_controls_code ON public.country_controls(country_code);
CREATE INDEX IF NOT EXISTS idx_country_controls_enabled ON public.country_controls(is_enabled);
CREATE INDEX IF NOT EXISTS idx_country_controls_sanctioned ON public.country_controls(is_sanctioned_frozen);

-- 3. Attach standard triggers
SELECT attach_standard_table_triggers('public.country_controls'::regclass);

-- 4. Enable and Force Row Level Security (RLS)
ALTER TABLE public.country_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_controls FORCE ROW LEVEL SECURITY;

-- 5. RLS Security Policy
DROP POLICY IF EXISTS pol_country_controls_isolation ON public.country_controls;
CREATE POLICY pol_country_controls_isolation ON public.country_controls
FOR ALL TO PUBLIC
USING (
  is_current_superadmin()
  OR
  current_setting('app.current_user_role', true) IN ('ceo', 'compliance_kyc', 'finance_ops', 'support')
  OR
  is_enabled = true
)
WITH CHECK (
  is_current_superadmin()
  OR
  current_setting('app.current_user_role', true) = 'ceo'
);
