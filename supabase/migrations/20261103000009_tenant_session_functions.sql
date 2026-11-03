-- path: supabase/migrations/20261103000009_tenant_session_functions.sql

-- ==============================================================================
-- KD SOLUTION IT: PostgreSQL Tenant Session Variable Infrastructure
-- Step 020: PostgreSQL Tenant Session Variable Infrastructure
-- Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines
-- ==============================================================================

-- 1. Helper Function: Set Tenant Session Context
-- Sets transaction-local session variables (SET LOCAL semantics via is_local = true)
-- Automatically configures app.current_company_id, app.current_tenant_id,
-- app.current_user_id, and app.is_superadmin
CREATE OR REPLACE FUNCTION set_tenant_context(
  p_company_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_is_superadmin boolean DEFAULT false
)
RETURNS void AS $$
BEGIN
  IF p_company_id IS NOT NULL THEN
    PERFORM set_config('app.current_company_id', p_company_id::text, true);
    PERFORM set_config('app.current_tenant_id', p_company_id::text, true);
  ELSE
    PERFORM set_config('app.current_company_id', '', true);
    PERFORM set_config('app.current_tenant_id', '', true);
  END IF;

  IF p_user_id IS NOT NULL THEN
    PERFORM set_config('app.current_user_id', p_user_id::text, true);
  ELSE
    PERFORM set_config('app.current_user_id', '', true);
  END IF;

  IF p_is_superadmin THEN
    PERFORM set_config('app.is_superadmin', 'true', true);
  ELSE
    PERFORM set_config('app.is_superadmin', 'false', true);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 2. Helper Function: Clear Tenant Session Context
-- Safely resets all tenant-specific session variables to empty defaults
CREATE OR REPLACE FUNCTION clear_tenant_context()
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_company_id', '', true);
  PERFORM set_config('app.current_tenant_id', '', true);
  PERFORM set_config('app.current_user_id', '', true);
  PERFORM set_config('app.is_superadmin', 'false', true);
END;
$$ LANGUAGE plpgsql;

-- 3. Utility Function: Safe Extraction of Current Company UUID
CREATE OR REPLACE FUNCTION get_current_company_id()
RETURNS uuid AS $$
DECLARE
  v_val text;
BEGIN
  v_val := NULLIF(current_setting('app.current_company_id', true), '');
  IF v_val IS NULL THEN
    v_val := NULLIF(current_setting('app.current_tenant_id', true), '');
  END IF;
  RETURN v_val::uuid;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- 4. Utility Function: Safe Extraction of Current Superadmin Flag
CREATE OR REPLACE FUNCTION is_current_superadmin()
RETURNS boolean AS $$
BEGIN
  RETURN COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true';
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$ LANGUAGE plpgsql STABLE;

-- 5. Standard Global RLS Policy Template Generator
-- Binds a standardized default-deny tenant isolation policy to target table
CREATE OR REPLACE FUNCTION apply_tenant_isolation_policy(
  target_table regclass,
  tenant_col text DEFAULT 'company_id'
)
RETURNS void AS $$
DECLARE
  tbl_name text;
  pol_name text;
BEGIN
  tbl_name := target_table::text;
  pol_name := 'pol_' || replace(tbl_name, '.', '_') || '_tenant_isolation';

  EXECUTE format('DROP POLICY IF EXISTS %I ON %s;', pol_name, tbl_name);

  EXECUTE format('
    CREATE POLICY %I ON %s
    FOR ALL
    TO PUBLIC
    USING (
      is_current_superadmin()
      OR
      %I = get_current_company_id()
    )
    WITH CHECK (
      is_current_superadmin()
      OR
      %I = get_current_company_id()
    );
  ', pol_name, tbl_name, tenant_col, tenant_col);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION set_tenant_context(uuid, uuid, boolean) IS 'Sets transaction-local tenant session variables for RLS policy evaluation';
COMMENT ON FUNCTION clear_tenant_context() IS 'Resets all tenant session variables to empty states';
COMMENT ON FUNCTION get_current_company_id() IS 'Extracts active company UUID from transaction session variables';
COMMENT ON FUNCTION apply_tenant_isolation_policy(regclass, text) IS 'Attaches standard multi-tenant RLS policy checking company_id or superadmin';
