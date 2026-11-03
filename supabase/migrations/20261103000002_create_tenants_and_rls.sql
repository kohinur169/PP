-- path: supabase/migrations/20261103000002_create_tenants_and_rls.sql

-- ==============================================================================
-- KD SOLUTION IT: Multi-Tenant Architecture & PostgreSQL Row-Level Security (RLS)
-- Step 009: Core Tenants, Settings, Users, Memberships & RLS Policies
-- ==============================================================================

-- 1. Tenants Table
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(63) NOT NULL UNIQUE,
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending_kyc', 'terminated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);

-- 2. Tenant Settings Table
CREATE TABLE IF NOT EXISTS tenant_settings (
  id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  default_currency VARCHAR(3) NOT NULL DEFAULT 'USD' CHECK (default_currency = 'USD'),
  allowed_countries TEXT[] NOT NULL DEFAULT '{"US", "SG", "GB"}',
  risk_tier INTEGER NOT NULL DEFAULT 1 CHECK (risk_tier IN (1, 2, 3)),
  settlement_delay_days INTEGER NOT NULL DEFAULT 2 CHECK (settlement_delay_days >= 0),
  rolling_reserve_pct NUMERIC(5,2) NOT NULL DEFAULT 5.00 CHECK (rolling_reserve_pct >= 0 AND rolling_reserve_pct <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_tenant_settings_tenant UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_settings_tenant_id ON tenant_settings(tenant_id);

-- 3. Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
  email CITEXT NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending_verification', 'deactivated')),
  is_superadmin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 4. Tenant Memberships Table (Multi-tenant RBAC mapping)
CREATE TABLE IF NOT EXISTS tenant_memberships (
  id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(32) NOT NULL DEFAULT 'merchant_viewer' CHECK (role IN ('owner', 'admin', 'compliance_officer', 'developer', 'merchant_viewer')),
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_tenant_user_membership UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_id ON tenant_memberships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user_id ON tenant_memberships(user_id);

-- 5. Updated_at Triggers
DROP TRIGGER IF EXISTS set_tenants_updated_at ON tenants;
CREATE TRIGGER set_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_tenant_settings_updated_at ON tenant_settings;
CREATE TRIGGER set_tenant_settings_updated_at BEFORE UPDATE ON tenant_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_users_updated_at ON users;
CREATE TRIGGER set_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_tenant_memberships_updated_at ON tenant_memberships;
CREATE TRIGGER set_tenant_memberships_updated_at BEFORE UPDATE ON tenant_memberships FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. Enable PostgreSQL Row-Level Security (RLS) on all tenant-scoped tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 7. Define RLS Policies with Superadmin Bypass Guard
-- Tenants isolation
DROP POLICY IF EXISTS tenant_isolation_policy ON tenants;
CREATE POLICY tenant_isolation_policy ON tenants FOR ALL USING (
  id::text = current_setting('app.current_tenant_id', true)
  OR current_setting('app.is_superadmin', true) = 'true'
);

-- Tenant Settings isolation
DROP POLICY IF EXISTS tenant_settings_isolation_policy ON tenant_settings;
CREATE POLICY tenant_settings_isolation_policy ON tenant_settings FOR ALL USING (
  tenant_id::text = current_setting('app.current_tenant_id', true)
  OR current_setting('app.is_superadmin', true) = 'true'
);

-- Tenant Memberships isolation
DROP POLICY IF EXISTS tenant_memberships_isolation_policy ON tenant_memberships;
CREATE POLICY tenant_memberships_isolation_policy ON tenant_memberships FOR ALL USING (
  tenant_id::text = current_setting('app.current_tenant_id', true)
  OR current_setting('app.is_superadmin', true) = 'true'
);

-- Users isolation: A user can access their own record or superadmin can access all
DROP POLICY IF EXISTS users_isolation_policy ON users;
CREATE POLICY users_isolation_policy ON users FOR ALL USING (
  id::text = current_setting('app.current_user_id', true)
  OR current_setting('app.is_superadmin', true) = 'true'
);
