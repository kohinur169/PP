-- path: db/migrations/015_office_2fa_resets.sql

-- ==============================================================================
-- KD SOLUTION IT: Office 2FA Reset Workflow for Lost Credentials
-- Step 054: Office 2FA Reset Workflow for Lost Credentials
-- Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile
-- ==============================================================================

-- 1. Create office_2fa_reset_requests table
CREATE TABLE IF NOT EXISTS public.office_2fa_reset_requests (
  id uuid PRIMARY KEY DEFAULT generate_uuid_v7(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  company_id uuid NULL,
  ticket_id varchar(100) NOT NULL,
  verification_docs jsonb NOT NULL DEFAULT '[]',
  reviewed_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  status varchar(50) NOT NULL DEFAULT 'pending',
  rejection_reason text NULL,
  approved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz NULL,
  version int NOT NULL DEFAULT 1
);

-- 2. Add must_setup_2fa flag to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS must_setup_2fa boolean NOT NULL DEFAULT false;

-- 3. Performance & Audit Indexes
CREATE INDEX IF NOT EXISTS idx_office_2fa_resets_user_id ON public.office_2fa_reset_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_office_2fa_resets_ticket_id ON public.office_2fa_reset_requests(ticket_id);
CREATE INDEX IF NOT EXISTS idx_office_2fa_resets_status ON public.office_2fa_reset_requests(status);

-- 4. Attach standard updated_at and version triggers
SELECT attach_standard_table_triggers('public.office_2fa_reset_requests'::regclass);

-- 5. Enable and Force Row Level Security (RLS)
ALTER TABLE public.office_2fa_reset_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_2fa_reset_requests FORCE ROW LEVEL SECURITY;

-- 6. RLS Security Policy
DROP POLICY IF EXISTS pol_office_2fa_reset_requests_isolation ON public.office_2fa_reset_requests;
CREATE POLICY pol_office_2fa_reset_requests_isolation ON public.office_2fa_reset_requests
FOR ALL TO PUBLIC
USING (
  is_current_superadmin()
  OR
  user_id::text = current_setting('app.current_user_id', true)
  OR
  reviewed_by::text = current_setting('app.current_user_id', true)
)
WITH CHECK (
  is_current_superadmin()
  OR
  user_id::text = current_setting('app.current_user_id', true)
  OR
  reviewed_by::text = current_setting('app.current_user_id', true)
);
