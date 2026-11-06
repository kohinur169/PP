-- path: db/migrations/004_enable_rls_default_deny.sql

-- ==============================================================================
-- KD SOLUTION IT: Row Level Security (RLS) Default-Deny & Force-RLS Setup
-- Step 019: Row Level Security (RLS) Default-Deny Policy Setup
-- Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines
-- ==============================================================================

-- 1. Helper Function: Enforce & Force Row Level Security
CREATE OR REPLACE FUNCTION enable_and_force_rls(target_table regclass)
RETURNS void AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY;', target_table);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY;', target_table);
END;
$$ LANGUAGE plpgsql;

-- 2. Apply ENABLE and FORCE ROW LEVEL SECURITY across all public tenant tables
ALTER TABLE IF EXISTS public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tenants FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tenant_settings FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tenant_memberships FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_sessions FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.user_mfa ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_mfa FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.companies FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.job_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.job_queue FORCE ROW LEVEL SECURITY;
