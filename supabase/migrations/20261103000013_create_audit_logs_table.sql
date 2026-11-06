-- path: supabase/migrations/20261103000013_create_audit_logs_table.sql

-- ==============================================================================
-- KD SOLUTION IT: Hash-Chained Append-Only Audit Log Schema Migration
-- Step 024: Hash-Chained Append-Only Audit Log Schema Migration
-- Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines
-- ==============================================================================

-- 1. Create audit_logs table with sequential sequence_id and UUIDv7 primary key
CREATE TABLE IF NOT EXISTS public.audit_logs (
  sequence_id bigserial NOT NULL UNIQUE,
  id uuid PRIMARY KEY DEFAULT generate_uuid_v7(),
  company_id uuid NULL REFERENCES public.companies(id) ON DELETE SET NULL,
  actor_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  action varchar(100) NOT NULL,
  entity_type varchar(100) NOT NULL,
  entity_id varchar(255) NULL,
  diff_payload jsonb NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash varchar(64) NOT NULL DEFAULT '0000000000000000000000000000000000000000000000000000000000000000',
  current_hash varchar(64) NOT NULL,
  entry_hash varchar(64) GENERATED ALWAYS AS (current_hash) STORED,
  signature varchar(256) NULL,
  ip_address varchar(45) NULL,
  user_agent text NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz NULL,
  version int NOT NULL DEFAULT 1
);

-- 2. Add Required Performance and Audit Trail Indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_id ON public.audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON public.audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_sequence_id ON public.audit_logs(sequence_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_lookup ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_hashes ON public.audit_logs(prev_hash, current_hash);

-- 3. Attach Automated updated_at and Version Triggers
SELECT attach_standard_table_triggers('public.audit_logs'::regclass);

-- 4. Enable and Force Row Level Security (RLS)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

-- 5. Define Audit Logs Tenant Isolation RLS Policy
DROP POLICY IF EXISTS pol_audit_logs_tenant_isolation ON public.audit_logs;
CREATE POLICY pol_audit_logs_tenant_isolation ON public.audit_logs
FOR ALL TO PUBLIC
USING (
  is_current_superadmin()
  OR
  (company_id IS NOT NULL AND company_id = get_current_company_id())
  OR
  actor_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
)
WITH CHECK (
  is_current_superadmin()
  OR
  (company_id IS NOT NULL AND company_id = get_current_company_id())
  OR
  actor_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  OR
  company_id IS NULL
);
