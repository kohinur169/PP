-- path: supabase/migrations/20261103000005_create_user_mfa_table.sql

-- ==============================================================================
-- KD SOLUTION IT: TOTP Multi-Factor Authentication (RFC 6238)
-- Step 015: User MFA State, Encrypted Secret Storage & Recovery Codes
-- ==============================================================================

-- 1. User MFA State Table
CREATE TABLE IF NOT EXISTS user_mfa (
  id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  totp_secret_encrypted TEXT NOT NULL,
  mfa_enabled BOOLEAN NOT NULL DEFAULT false,
  backup_codes_hashes TEXT[] NOT NULL DEFAULT '{}',
  last_used_step BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_user_mfa_user_id ON user_mfa(user_id);
CREATE INDEX IF NOT EXISTS idx_user_mfa_enabled ON user_mfa(mfa_enabled);

-- 3. Automatic updated_at Trigger
DROP TRIGGER IF EXISTS set_user_mfa_updated_at ON user_mfa;
CREATE TRIGGER set_user_mfa_updated_at 
  BEFORE UPDATE ON user_mfa 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Enable PostgreSQL Row-Level Security (RLS)
ALTER TABLE user_mfa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_mfa_isolation_policy ON user_mfa;
CREATE POLICY user_mfa_isolation_policy ON user_mfa FOR ALL USING (
  user_id::text = current_setting('app.current_user_id', true)
  OR current_setting('app.is_superadmin', true) = 'true'
);
