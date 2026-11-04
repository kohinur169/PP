-- path: db/migrations/017_create_user_devices.sql

-- ==============================================================================
-- KD SOLUTION IT: User Devices & Hardware Fingerprint Schema Migration
-- Step 056: Per-Device Proof Key & Hardware Fingerprinting Engine
-- Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile
-- ==============================================================================

-- 1. Create user_devices table
CREATE TABLE IF NOT EXISTS public.user_devices (
  id uuid PRIMARY KEY DEFAULT generate_uuid_v7(),
  company_id uuid NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_fingerprint varchar(64) NOT NULL,
  proof_key varchar(128) NOT NULL,
  device_name varchar(255) NOT NULL DEFAULT 'Unknown Device',
  first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_ip varchar(45) NOT NULL,
  last_user_agent text NOT NULL DEFAULT 'Unknown User-Agent',
  is_trusted boolean NOT NULL DEFAULT false,
  confirmation_code_hash varchar(64) NULL,
  confirmation_code_expires_at timestamptz NULL,
  confirmed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz NULL,
  version int NOT NULL DEFAULT 1
);

-- 2. Performance & Unique Constraints
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_devices_user_fingerprint 
  ON public.user_devices(user_id, device_fingerprint) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON public.user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_fingerprint ON public.user_devices(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_user_devices_proof_key ON public.user_devices(proof_key);

-- 3. Attach standard updated_at and version triggers
SELECT attach_standard_table_triggers('public.user_devices'::regclass);

-- 4. Enable and Force Row Level Security (RLS)
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_devices FORCE ROW LEVEL SECURITY;

-- 5. RLS Security Policy
DROP POLICY IF EXISTS pol_user_devices_isolation ON public.user_devices;
CREATE POLICY pol_user_devices_isolation ON public.user_devices
FOR ALL TO PUBLIC
USING (
  is_current_superadmin()
  OR
  user_id::text = current_setting('app.current_user_id', true)
  OR
  company_id::text = current_setting('app.current_company_id', true)
)
WITH CHECK (
  is_current_superadmin()
  OR
  user_id::text = current_setting('app.current_user_id', true)
  OR
  company_id::text = current_setting('app.current_company_id', true)
);
