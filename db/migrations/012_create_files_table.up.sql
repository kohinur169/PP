-- path: db/migrations/012_create_files_table.up.sql

-- ==============================================================================
-- KD SOLUTION IT: File Metadata Schema & Company Isolation Migration
-- Step 042: File Metadata Schema & Company Isolation Migration
-- Phase 3: Cryptography, Key Management & Secure Storage Layer
-- ==============================================================================

-- 1. Create files metadata table
CREATE TABLE IF NOT EXISTS public.files (
  id uuid PRIMARY KEY DEFAULT generate_uuid_v7(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category varchar(50) NOT NULL DEFAULT 'general',
  original_name varchar(255) NOT NULL,
  storage_provider varchar(20) NOT NULL DEFAULT 'supabase',
  storage_path text NOT NULL,
  file_hash varchar(64) NOT NULL,
  encrypted_hash varchar(64) NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  mime_type varchar(100) NOT NULL,
  is_encrypted boolean NOT NULL DEFAULT true,
  encryption_version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz NULL,
  version int NOT NULL DEFAULT 1,
  CONSTRAINT chk_files_category CHECK (category IN ('kyc', 'dispute', 'logo', 'invoice', 'export', 'general')),
  CONSTRAINT chk_files_storage_provider CHECK (storage_provider IN ('supabase', 's3', 'mock'))
);

-- 2. Performance & Multi-Tenant Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_files_company_id ON public.files(company_id);
CREATE INDEX IF NOT EXISTS idx_files_category ON public.files(category);
CREATE INDEX IF NOT EXISTS idx_files_file_hash ON public.files(file_hash);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON public.files(created_at);

-- 3. Standard Table Triggers for updated_at and optimistic locking version
SELECT attach_standard_table_triggers('public.files'::regclass);

-- 4. Enable and Force Row Level Security (RLS)
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files FORCE ROW LEVEL SECURITY;

-- 5. Tenant Isolation Policy: sub-merchants only access their company's files
DROP POLICY IF EXISTS pol_files_tenant_isolation ON public.files;
CREATE POLICY pol_files_tenant_isolation ON public.files
FOR ALL TO PUBLIC
USING (
  is_current_superadmin()
  OR
  company_id = get_current_company_id()
)
WITH CHECK (
  is_current_superadmin()
  OR
  company_id = get_current_company_id()
);
