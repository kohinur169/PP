-- path: supabase/migrations/20261103000028_compliance_officer_settings.sql

-- ==============================================================================
-- KD SOLUTION IT: Designated Compliance Officer Settings & Registry
-- Step 078: Designated Compliance Officer Settings & Registry
-- Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine
-- ==============================================================================

-- 1. Create compliance_officer_settings table
CREATE TABLE IF NOT EXISTS public.compliance_officer_settings (
  id uuid PRIMARY KEY DEFAULT generate_uuid_v7(),
  officer_name varchar(255) NOT NULL,
  official_email varchar(255) NOT NULL,
  regulator_registration_number varchar(100) NOT NULL,
  contact_phone varchar(50) NOT NULL,
  appointment_date timestamptz NOT NULL DEFAULT clock_timestamp(),
  jurisdiction varchar(100) NOT NULL DEFAULT 'US-Delaware / EU-EEA',
  status varchar(50) NOT NULL DEFAULT 'active',
  appointed_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  ceo_approved_by uuid NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  ceo_approved_at timestamptz NULL,
  change_justification text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz NULL,
  version int NOT NULL DEFAULT 1,
  CONSTRAINT chk_compliance_officer_status CHECK (status IN ('active', 'pending_ceo_approval', 'superseded'))
);

-- 2. Audit & Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_compliance_officer_status ON public.compliance_officer_settings(status);
CREATE INDEX IF NOT EXISTS idx_compliance_officer_created ON public.compliance_officer_settings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_officer_regulator ON public.compliance_officer_settings(regulator_registration_number);

-- 3. Attach standard updated_at and version triggers
SELECT attach_standard_table_triggers('public.compliance_officer_settings'::regclass);

-- 4. Enable and Force Row Level Security (RLS)
ALTER TABLE public.compliance_officer_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_officer_settings FORCE ROW LEVEL SECURITY;

-- 5. RLS Security Policy: Public read for disclosures, strict executive write
DROP POLICY IF EXISTS pol_compliance_officer_read ON public.compliance_officer_settings;
CREATE POLICY pol_compliance_officer_read ON public.compliance_officer_settings
FOR SELECT TO PUBLIC
USING (
  status = 'active'
  OR is_current_superadmin()
  OR current_setting('app.current_user_role', true) IN ('ceo', 'compliance_kyc')
);

DROP POLICY IF EXISTS pol_compliance_officer_write ON public.compliance_officer_settings;
CREATE POLICY pol_compliance_officer_write ON public.compliance_officer_settings
FOR ALL TO PUBLIC
USING (
  is_current_superadmin()
  OR current_setting('app.current_user_role', true) = 'ceo'
)
WITH CHECK (
  is_current_superadmin()
  OR current_setting('app.current_user_role', true) = 'ceo'
);
