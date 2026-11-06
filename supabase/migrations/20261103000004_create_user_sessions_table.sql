-- path: supabase/migrations/20261103000004_create_user_sessions_table.sql

-- ==============================================================================
-- KD SOLUTION IT: LR-022 Session Security Engine & Ephemeral Device Binding
-- Step 013: User Sessions Table, Device Fingerprinting & Concurrent Limit
-- ==============================================================================

-- 1. User Sessions Table
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  session_token_hash VARCHAR(64) NOT NULL UNIQUE,
  device_fingerprint VARCHAR(64) NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  user_agent TEXT NOT NULL,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revocation_reason VARCHAR(64)
);

-- 2. Performance & Audit Indexes
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(session_token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(user_id, revoked_at, expires_at);

-- 3. Updated_at Trigger
DROP TRIGGER IF EXISTS set_user_sessions_updated_at ON user_sessions;
CREATE TRIGGER set_user_sessions_updated_at 
  BEFORE UPDATE ON user_sessions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Enable PostgreSQL Row-Level Security (RLS)
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_sessions_isolation_policy ON user_sessions;
CREATE POLICY user_sessions_isolation_policy ON user_sessions FOR ALL USING (
  user_id::text = current_setting('app.current_user_id', true)
  OR current_setting('app.is_superadmin', true) = 'true'
);
