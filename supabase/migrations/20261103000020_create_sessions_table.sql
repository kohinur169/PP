-- path: supabase/migrations/20261103000020_create_sessions_table.sql

-- ==============================================================================
-- KD SOLUTION IT: LR-022 Session Engine Schema Migration
-- Step 055: LR-022 Session Engine with HttpOnly Secure SameSite=Strict Cookies
-- Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile
-- ==============================================================================

-- 1. Create sessions table with UUIDv7 session_id and enterprise security columns
CREATE TABLE IF NOT EXISTS public.sessions (
  id uuid PRIMARY KEY DEFAULT generate_uuid_v7(),
  session_id uuid NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  company_id uuid NULL,
  token_hash varchar(64) NOT NULL UNIQUE,
  device_id varchar(128) NULL,
  device_fingerprint varchar(64) NOT NULL DEFAULT '',
  ip_address varchar(45) NOT NULL DEFAULT '127.0.0.1',
  user_agent text NOT NULL DEFAULT 'Unknown User-Agent',
  last_active_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  revocation_reason varchar(64) NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz NULL,
  version int NOT NULL DEFAULT 1
);

-- 2. Synchronize session_id with primary key id
CREATE OR REPLACE FUNCTION sync_sessions_session_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.session_id IS NULL THEN
    NEW.session_id := NEW.id;
  END IF;
  IF NEW.id IS NULL AND NEW.session_id IS NOT NULL THEN
    NEW.id := NEW.session_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sessions_sync_session_id ON public.sessions;
CREATE TRIGGER trg_sessions_sync_session_id
  BEFORE INSERT ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION sync_sessions_session_id();

-- 3. Performance & Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON public.sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_device_id ON public.sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON public.sessions(user_id, revoked_at, expires_at);

-- 4. Attach standard updated_at and version triggers
SELECT attach_standard_table_triggers('public.sessions'::regclass);

-- 5. Enable and Force Row Level Security (RLS)
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions FORCE ROW LEVEL SECURITY;

-- 6. RLS Security Policy
DROP POLICY IF EXISTS pol_sessions_isolation ON public.sessions;
CREATE POLICY pol_sessions_isolation ON public.sessions
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
