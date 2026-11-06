-- path: db/migrations/023_create_compliance_calendar.sql

-- ==============================================================================
-- KD SOLUTION IT: Compliance Calendar, Cyber Insurance & PCI Attestation Renewal Tracker
-- Step 079: Compliance Calendar, Cyber Insurance & PCI Attestation Renewal Tracker
-- Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine
-- ==============================================================================

-- 1. Create compliance_calendar_events table
CREATE TABLE IF NOT EXISTS public.compliance_calendar_events (
  id uuid PRIMARY KEY DEFAULT generate_uuid_v7(),
  event_name varchar(255) NOT NULL,
  category varchar(100) NOT NULL,
  expiry_date timestamptz NOT NULL,
  assigned_to uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  status varchar(50) NOT NULL DEFAULT 'active',
  notification_lead_days integer[] NOT NULL DEFAULT '{90, 60, 30, 7}',
  last_alert_sent_at timestamptz NULL,
  last_alert_threshold integer NULL,
  notes text NULL,
  evidence_file_id uuid NULL REFERENCES public.files(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz NULL,
  version int NOT NULL DEFAULT 1,
  CONSTRAINT chk_calendar_status CHECK (status IN ('active', 'urgent', 'critical', 'renewed', 'expired'))
);

-- 2. Audit & Schedule Indexes
CREATE INDEX IF NOT EXISTS idx_compliance_calendar_expiry ON public.compliance_calendar_events(expiry_date);
CREATE INDEX IF NOT EXISTS idx_compliance_calendar_status ON public.compliance_calendar_events(status);
CREATE INDEX IF NOT EXISTS idx_compliance_calendar_assigned ON public.compliance_calendar_events(assigned_to);
CREATE INDEX IF NOT EXISTS idx_compliance_calendar_category ON public.compliance_calendar_events(category);

-- 3. Attach standard updated_at and version triggers
SELECT attach_standard_table_triggers('public.compliance_calendar_events'::regclass);

-- 4. Enable and Force Row Level Security (RLS)
ALTER TABLE public.compliance_calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_calendar_events FORCE ROW LEVEL SECURITY;

-- 5. RLS Security Policy: Restricted to Office Roles (Compliance KYC, Super Admin, CEO)
DROP POLICY IF EXISTS pol_compliance_calendar_isolation ON public.compliance_calendar_events;
CREATE POLICY pol_compliance_calendar_isolation ON public.compliance_calendar_events
FOR ALL TO PUBLIC
USING (
  is_current_superadmin()
  OR
  current_setting('app.current_user_role', true) IN ('compliance_kyc', 'ceo')
  OR
  assigned_to::text = current_setting('app.current_user_id', true)
)
WITH CHECK (
  is_current_superadmin()
  OR
  current_setting('app.current_user_role', true) IN ('compliance_kyc', 'ceo')
  OR
  assigned_to::text = current_setting('app.current_user_id', true)
);
