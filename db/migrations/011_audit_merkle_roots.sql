-- path: db/migrations/011_audit_merkle_roots.sql

-- ==============================================================================
-- KD SOLUTION IT: Merkle Tree Audit Batch Aggregation Schema Migration
-- Step 027: Merkle Tree Audit Batch Aggregation Engine
-- Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines
-- ==============================================================================

-- 1. Step 027.3: Create audit_merkle_roots table storing daily batch roots
CREATE TABLE IF NOT EXISTS public.audit_merkle_roots (
  id uuid PRIMARY KEY DEFAULT generate_uuid_v7(),
  company_id uuid NULL REFERENCES public.companies(id) ON DELETE SET NULL,
  batch_date date NOT NULL,
  merkle_root varchar(64) NOT NULL,
  entry_count int NOT NULL CHECK (entry_count >= 0),
  first_sequence_id bigint NOT NULL,
  last_sequence_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz NULL,
  version int NOT NULL DEFAULT 1
);

-- 2. Add Unique and Performance Indexes
CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_merkle_roots_batch_date
  ON public.audit_merkle_roots (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), batch_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_audit_merkle_roots_batch_date ON public.audit_merkle_roots(batch_date);
CREATE INDEX IF NOT EXISTS idx_audit_merkle_roots_company_id ON public.audit_merkle_roots(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_merkle_roots_merkle_root ON public.audit_merkle_roots(merkle_root);
CREATE INDEX IF NOT EXISTS idx_audit_merkle_roots_sequences ON public.audit_merkle_roots(first_sequence_id, last_sequence_id);

-- 3. Attach Standard Triggers
SELECT attach_standard_table_triggers('public.audit_merkle_roots'::regclass);

-- 4. Enable and Force Row Level Security (RLS)
ALTER TABLE public.audit_merkle_roots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_merkle_roots FORCE ROW LEVEL SECURITY;

-- 5. Define Merkle Roots Tenant Isolation Policy
DROP POLICY IF EXISTS pol_audit_merkle_roots_tenant_isolation ON public.audit_merkle_roots;
CREATE POLICY pol_audit_merkle_roots_tenant_isolation ON public.audit_merkle_roots
FOR ALL TO PUBLIC
USING (
  is_current_superadmin()
  OR
  (company_id IS NOT NULL AND company_id = get_current_company_id())
  OR
  company_id IS NULL
)
WITH CHECK (
  is_current_superadmin()
  OR
  (company_id IS NOT NULL AND company_id = get_current_company_id())
  OR
  company_id IS NULL
);
